const _ = require('lodash')
const kefir = require('kefir')
const cluster = require('cluster')

const RabbitMQReporter = require('./lib/report/rabbitmq')
const TemplateReport$ = require('./lib/report/streams/template')
const ShareReport$ = require('./lib/report/streams/share')
const blocksToTemplate$ = require('./lib/master-template-stream')
const BlockSubmissionEvent$ = require('./lib/block-submission-stream')
const SubmitBlocks$ = require('./lib/submit-blocks-stream')
const Logger = require('./lib/logger')
const BlockCollection = require('./model/bitcoin/block').Collection

const MACHINE_ID = 'DevelopmentCoordinator'

const getBrokerErrorMessage = coinType => `${coinType}_broker_error`
module.exports = ({brokerConfig, rabbitMqConfig, workerPoolEventStream, coinBroker}) => {
  // Creating the BlockCollection Object
  // Interface is:
  //  Events: add, reset
  //  Methods: getCoinbaseAssemblyMerkleArray, toHexString, getMerkleRoot, blockHeaderToHexString, getHash
  let machineId = _.get(brokerConfig, 'machine_id', MACHINE_ID)
  let reporter = new RabbitMQReporter(Object.assign({}, rabbitMqConfig, {machine_id: machineId}))
  // ************************************************ FETCH TEMPLATES *************************************************
  // Caching for block templates
  let unfillteredCoinTemplate$ = kefir.stream(emitter => {
    let getBlockTemplate = (options) => coinBroker.getBlockTemplate(options, (err, template) => {
      let delay = 0
      if (!err) {
        options.longpollid = template.longpollid
      }
      if (err) delay = 500
      emitter.emit({template, err})
      setTimeout(() => getBlockTemplate(options), delay)
    })
    // Delay starting the broker - in order to allow the rabbitmq queue to warm up
    reporter.once('ready', () => setTimeout(() => getBlockTemplate(brokerConfig.options), 1000))
    return () => {}
  })

  let coinTemplate$ = unfillteredCoinTemplate$
    .filter(({err}) => !err)
    .map(({template}) => template)
  let coinError$ = unfillteredCoinTemplate$
    .filter(({err}) => err)
    .map(({err}) => Object.assign({class: 'error', type: getBrokerErrorMessage(brokerConfig['coin_type']), err: err.message}))
  let templateCollection = new BlockCollection()
  let template$ = blocksToTemplate$(coinTemplate$, brokerConfig['block'])
    .map(({newHeight, template}) => {
      newHeight && templateCollection.reset()
      templateCollection.add(template)
      return template
    })

  // ********************************************* TEMPLATE DISTRIBUTION *********************************************
  let workerStart$ = workerPoolEventStream.filter(({type}) => type === 'process_start')

  kefir.merge([
    template$.sampledBy(workerStart$, (template, {worker_id}) => ({template, worker: worker_id})),
    template$.flatMap((template) => kefir.sequentially(0, Object.keys(cluster.workers).map((worker) => ({
      template,
      worker
    }))))
  ])
    .onValue(({template, worker}) => {
      (cluster.workers[worker] || {send: _.noop}).send({
        'type': 'template_new',
        'target': template.get('target'),
        'create': template.get('create').getTime(),
        'version': template.get('version'),
        'previous_hash': template.get('previous_hash'),
        'height': template.get('height'),
        'id': template.id,
        'nbits': template.get('nbits'),
        'coinbase': template.get('transaction').at(0).toHexString(),
        'merkle_tree': template.getMerkleTree(),
        'templateMark': template.get('templateMark'),
        'coin_type': brokerConfig['coin_type']
      })
    })

  // ********************************************* BLOCK SUBMISSION **************************************************
  let workerPoolCoinRelevantEventStream = workerPoolEventStream.filter((event) => {
    return event['coin_type'] === brokerConfig['coin_type']
  })

  let blockSubmissionEvent$ = BlockSubmissionEvent$(workerPoolCoinRelevantEventStream, templateCollection)
  // Creating the Stream to submit blocks to the bitcoin broker
  let submitBlocks$ = SubmitBlocks$(blockSubmissionEvent$, coinBroker, brokerConfig['coin_type'])

  // ************************************************ BUSINESS REPORT ************************************************

  kefir.merge([
    TemplateReport$(template$, _.get(brokerConfig, 'block.deposit_address')),
    ShareReport$(workerPoolCoinRelevantEventStream),
    workerPoolCoinRelevantEventStream,
    submitBlocks$,
    coinError$
  ])
    .map(eventObj => {
      let tmp = _.cloneDeep(eventObj)
      Object.assign(tmp, {machine_id: machineId, coin_type: brokerConfig['coin_type']})
      return tmp
    })
    .onValue((eventObj) => {
      if (eventObj.type) {
        return kefir.fromPromise(reporter.report(eventObj))
      } else {
        return kefir.fromPromise(reporter.report(Object.assign({type: 'for-check'}, eventObj)))
      }
    })

  // **************************************************** LOG REPORT *************************************************
  let logStreams = Logger({config: brokerConfig['log'], machineId})

  logStreams([
    coinError$,
    workerPoolCoinRelevantEventStream,
    submitBlocks$,
    template$.map((template) => ({
      type: 'template_new',
      height: template.get('height'),
      template_id: template.id,
      target: template.get('target'),
      coin_type: brokerConfig['coin_type']
    })),
    kefir.fromEvents(reporter, 'error').map(({message}) => ({
      class: 'error',
      type: 'amqp_connection_error',
      message,
      process_id: process.pid
    }))
  ])
}
