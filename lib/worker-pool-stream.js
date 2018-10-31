const _ = require('lodash')
const kefir = require('kefir')
const numCPUs = require('os').cpus().length
const cluster = require('cluster')

const WORKER_RESTART_LIMIT = 5000
const WORKER_RESTART_DELAY = 50

// ********************************************* PROCESS MANAGEMENT ************************************************
module.exports = (config) => kefir.merge(
  _.range(numCPUs).map(() =>
    kefir.repeat((iterationId) => {
      // Stop relaunching process when limit exceeds
      if (iterationId > _.get(config, 'worker.restart.limit', WORKER_RESTART_LIMIT)) return false

      let worker = cluster.fork()

      const workerEndStream = kefir
        .fromEvents(worker, 'exit')
        .take(1)
        .map((code) => ({ type: 'process_exit', code }))

      const workerErrorStream = kefir
        .fromEvents(worker, 'error')
        .map((error) => ({ class: 'error', type: 'process_error', error }))

      const workerMessageStream = kefir
        .fromEvents(worker, 'message')

      return kefir.merge([
        kefir.constant({ type: 'process_initiate', worker_iteration: iterationId }),
        workerEndStream,
        workerMessageStream,
        workerErrorStream
      ])
      .takeUntilBy(workerEndStream.delay(_.get(config, 'worker.restart.delay', WORKER_RESTART_DELAY)))
      .map((event) => Object.assign(event, { process_id: worker.id }))
    }).beforeEnd(() => ({ type: 'process_retrial_exhaust' }))
  )
)
