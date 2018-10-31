const amqp = require('amqp')
const kefir = require('kefir')
const EventEmitter = require('events').EventEmitter

const MESSAGE_PERSISTENT = 2
const MESSAGE_NON_PERSISTENT = 1

module.exports = class extends EventEmitter {
  constructor ({
    host,
    port,
    login,
    password,
    exchange_name,
    vhost = '/'
  }) {
    super()

    let connection = amqp.createConnection({
      host,
      port,
      login,
      password,
      vhost,
      noDelay: true,
      connectionTimeout: 10000
    })
    // add this for better debuging
    connection.on('error', function (e) {
      console.log('Error from amqp: ', e)
    })

// Wait for connection to become established.
    connection.on('ready', function () {
      // Use the default 'amq.topic' exchange
      console.log(`Connection to exchange ${exchange_name} is ready`) // eslint-disable-line camelcase
    })
    kefir
      .fromEvents(connection, 'ready')
      .onValue(this.emit.bind(this, 'ready'))
    kefir
      .fromEvents(connection, 'error')
      .onValue(this.emit.bind(this, 'error'))

    let exchangeProperty = kefir
      .fromEvents(connection, 'ready')
      .take(1)
      .map(() => connection.exchange(exchange_name, { durable: true, autoDelete: false, type: 'topic' }))
      .toProperty()

    let dataStream = kefir.stream((emitter) => { this.report = (data) => emitter.emit(data) })

    // Distribute
    dataStream
      .filter(({ type }) => type !== 'submit_new')
      .map((message) => {
        return (function ({ priority, deliveryMode, topic, immediate, mandatory }) {
          return {
            deliveryMode,
            priority,
            immediate,
            topic,
            message,
            mandatory
          }
        })({
          'broker_error': { topic: `broker.error`, priority: 3, deliveryMode: MESSAGE_PERSISTENT, immediate: false, mandatory: false },
          'worker_authorize': { topic: `worker.authorize.${message['session_id']}`, priority: 2, deliveryMode: MESSAGE_NON_PERSISTENT, immediate: false, mandatory: false },
          'worker_update': { topic: `worker.update`, priority: 1, deliveryMode: MESSAGE_NON_PERSISTENT, immediate: false, mandatory: false },
          'block_new': { topic: `block.new`, priority: 2, deliveryMode: MESSAGE_PERSISTENT, immediate: false, mandatory: false },
          'submit_error': { topic: `submit.error.${message['session_id']}`, priority: 2, deliveryMode: MESSAGE_PERSISTENT, immediate: false, mandatory: false },
          'share_new': { topic: `share.new.${message['session_id']}.${message['worker_id']}`, priority: 3, deliveryMode: MESSAGE_PERSISTENT, immediate: false, mandatory: false },
          'template_new': { topic: `template.new`, priority: 3, deliveryMode: MESSAGE_PERSISTENT, immediate: false, mandatory: false }
        }[message.type] || {
          topic: ['log', ...message['type'].split('_')].join('.'),
          priority: 1,
          deliveryMode: MESSAGE_NON_PERSISTENT,
          immediate: false,
          mandatory: false
        })
      })
      .combine(exchangeProperty)
      .onValue(([{
        deliveryMode,
        priority,
        immediate,
        topic,
        message,
        mandatory
      }, exchange]) => {
        exchange.publish(topic, message, {
          contentType: 'application/json',
          deliveryMode,
          priority,
          immediate,
          topic,
          message
        })
      })
  }
}
