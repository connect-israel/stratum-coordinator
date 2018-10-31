const kefir = require('kefir')
const logger = require('./services/cb-log')

module.exports = ({config, machineId}) =>
  (streams) => {
    kefir.merge(streams)
      .map((event) => Object.assign({}, event, { machine_id: machineId }))
      .map(logFieldMapper)
      .onValue((event) => {
        return logger[event['class'] || 'info'](event)
      })
  }

const logFieldMapper = (event) =>
  event['type'] === 'submit_new'
    ? {
      type: event['type'],
      ip: event['remote_ip'],
      create: event['create'],
      sId: event['session_id'],
      time: event['time'],
      nonce: event['nonce'],
      ntime: event['ntime'],
      en1: event['extra_nonce_1'],
      en2: event['extra_nonce_2'],
      diff: event['difficulty'],
      wId: event['worker_id'],
      wName: event['worker_name'],
      uName: event['user_name'],
      hash: event['hash'],
      tId: event['template_id'],
      height: event['height'],
      jId: event['job_id'],
      coin: event['coin_type'],
      cId: event['connection_id'],
      pId: event['process_id'],
      mId: event['machine_id']
    } : event
