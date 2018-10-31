'use strict'
const kefir = require('kefir')
const _ = require('lodash')
const numCPUs = require('os').cpus().length

const RabbitMQReporter = require('./lib/report/rabbitmq')
const Logger = require('./lib/logger')

module.exports = ({workerPoolEventStream, rabbitMqConfig, logConfig, machineId}) => {
  const serviceUpStream = kefir.constant(({type: 'service_up', cpu_count: numCPUs}))
  const workersGeneralEventsStream = workerPoolEventStream.filter(
    ({coin_type}) => {
      /*  eslint-disable camelcase  */
      return !coin_type
      /*  eslint-enable camelcase  */
    })
  // ************************************************ BUSINESS REPORT ************************************************
  let reporter = new RabbitMQReporter(Object.assign({}, rabbitMqConfig, {machine_id: machineId}))

  kefir.merge([
    serviceUpStream,
    workersGeneralEventsStream
  ])
    .map(eventObj => {
      let tmp = _.cloneDeep(eventObj)
      Object.assign(tmp, {machine_id: machineId})
      return tmp
    })
    .onValue((eventObj) => {
      if (eventObj.type) {
        return kefir.fromPromise(reporter.report(eventObj))
      } else {
        return kefir.fromPromise(reporter.report(Object.assign({type: 'no_type'}, eventObj)))
      }
    })

  // **************************************************** LOG REPORT *************************************************
  const logStreams = Logger({config: logConfig, machineId})
  logStreams([
    serviceUpStream,
    workersGeneralEventsStream
  ])
}
