const cluster = require('cluster')
const kefir = require('kefir')
const _ = require('lodash')
const config = require('config')
const {workersRedis, workersService} = config
const bitcoin = require('bitcoin')
const Workers = require('workers')
const master = require('./master.js')
const worker = require('./worker.js')
const WorkerPoolEventStream = require('./lib/worker-pool-stream')
const MiningCoinService = require('./lib/services/mining-coin-service')
const generalEventsReporter = require('./general-events-reporter')
const logger = require('./lib/services/cb-log')

// Create a new emtpy block collection for the master to populate with templates
if (cluster.isMaster) {
  console.log('Starting up connect-coordinator')
  // Create the worker pool event stream
  let workerPoolEventStream = WorkerPoolEventStream(config)
  generalEventsReporter({
    workerPoolEventStream,
    rabbitMqConfig: Object.assign({}, _.get(config, 'report.rabbitmq'),
      {exchange_name: _.get(config, 'report.rabbitmq.general_messages_exchange_name')}),
    logConfig: _.get(config, 'log'),
    machineId: _.get(config, 'machine_id')
  })
  // Creating the Bitcoind Objects - connect to different nodes for different coin type
  // Interface is:
  //  Events: template, error
  //  Methods: submit, getMiningInfo, getBestBlockHash
  console.log(JSON.stringify(config))
  Object.values(config['bitcoind']).forEach(clientConfig => {
    clientConfig.timeout = parseInt(clientConfig.timeout)
    const coinBroker = new bitcoin.Client(clientConfig)
    coinBroker.getBlockchainInfo((err, res) => {
      if (err) throw err
      const brokerConfig = Object.assign({}, _.pick(config, ['machine_id', 'log']), clientConfig)
      const exchangeName = _.get(config, 'report.rabbitmq.exchange_name') + `${brokerConfig['coin_type']}`
      const rabbitMqConfig = Object.assign({}, _.get(config, 'report.rabbitmq'), {'exchange_name': `${exchangeName}`})
      master({brokerConfig, rabbitMqConfig, workerPoolEventStream, coinBroker})
    })
  })
} else {
  let incomingMessageStream = kefir.fromEvents(process, 'message')
  workersService.timeout = parseInt(workersService.timeout)
  const workersClient = new Workers({redisConfig: workersRedis, workersServiceConfig: workersService, logger})
  const mineModeService = new MiningCoinService({workersClient})
  worker({config: config['stratum'], incomingMessageStream, mineModeService})
}
