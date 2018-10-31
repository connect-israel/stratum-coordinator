const _ = require('lodash')
const net = require('net')
const kefir = require('kefir')
const split = require('split')
const jsonic = require('jsonic')
const uuidV4 = require('uuid/v4')
const EventEmitter = require('events').EventEmitter
const StratumSession = require('./stratum-session/index')
const ERR = require('./errors')

const TCP_PROXY_REGEX = /^PROXY\s(TCP[46])\s([a-f0-9.:]+)\s([a-f0-9.:]+)\s([0-9]+)\s([0-9]+)\s*$/i

const createStratumError = function (code = 20) {
  return [code, {
    20: 'Other/Unknown',
    21: 'Job not found',
    22: 'Duplicate share',
    23: 'Low difficulty share',
    24: 'Unauthorized worker',
    25: 'Not subscribed'
  }[code], null]
}

const MINUTE = 1000 * 60
const DEFAULT_SUBMIT_TIMEOUT = 7 * MINUTE
const DEFAULT_SOCKET_TIMEOUT = 5 * MINUTE
const DEFAULT_ALLOW_TCP_PROXY_PROTOCOL = true
const DEFAULT_METHOD_CALL_TIMEOUT = 1000
const DEFAULT_MAX_INPUT_BUFFER_LENGTH = 10240
const DEFAULT_PORT = 3333

module.exports = class extends EventEmitter {
  constructor ({
                 allow_tcp_proxy_protocol = DEFAULT_ALLOW_TCP_PROXY_PROTOCOL, // eslint-disable-line camelcase
                 method_call_timeout = DEFAULT_METHOD_CALL_TIMEOUT, // eslint-disable-line camelcase
                 max_input_buffer_length = DEFAULT_MAX_INPUT_BUFFER_LENGTH, // eslint-disable-line camelcase
                 host,
                 port = DEFAULT_PORT,
                 authenticationService
               }, templateCollections, mineModeService) {
    super()

    let server = net.createServer().listen(..._.compact([host, port]))

    let serverStream = kefir
      .fromEvents(server, 'connection')
      .flatMap((socket) => {
        socket.setTimeout(DEFAULT_SOCKET_TIMEOUT)

        let connectionId = uuidV4()
        let stratumSession = new StratumSession({authenticationService, miningCoinService: mineModeService, templateCollections})
        let socketCloseStream = kefir.fromEvents(socket, 'close').take(1).toProperty()

        let submitTimeoutExceedStream = kefir
          .fromEvents(stratumSession, 'submit_new')
          .merge(kefir.later(1, 0))
          .debounce(DEFAULT_SUBMIT_TIMEOUT)
          .take(1)

        let workerLoginExceedStream = kefir
          .fromEvents(stratumSession, 'worker_authorize_exceed')
          .take(1)

        let socketTimeoutStream = kefir.fromEvents(socket, 'timeout')

        let socketSplitStream = socket
          .setEncoding('utf8')
          .pipe(split(null, null, {trailing: false, maxLength: max_input_buffer_length}))

        let socketErrorStream = kefir
          .merge([
            kefir.fromEvents(socket, 'error'),
            kefir.fromEvents(socketSplitStream, 'error')
          ])
          .map(({message} = {message: 'unknown'}) => message)

        let rawLineStream = kefir.fromEvents(socketSplitStream, 'data')
        socketCloseStream.onValue(() => {
          stratumSession.terminate()
        })

        let proxyStream = rawLineStream
          .take(1)
          .flatMap((rawLine = '') => {
            let [, protocol, client_ip, proxy_ip, client_port, proxy_port] = (rawLine).match(TCP_PROXY_REGEX) || [] // eslint-disable-line camelcase
            return allow_tcp_proxy_protocol && !!protocol ? kefir.constant({ // eslint-disable-line camelcase
              type: 'proxy_set',
              protocol,
              client_ip,
              client_port,
              proxy_ip,
              proxy_port
            }) : kefir.constantError(rawLine) // eslint-disable-line camelcase
          })

        let methodInvocationStream =
          kefir.concat([
            proxyStream.ignoreValues().flatMapErrors((rawLine) => kefir.constant(rawLine)),
            rawLineStream
          ])
            .flatMap((rawLine) => {
              let parsed = _.attempt(_.partial(jsonic, rawLine))
              return _.isError(parsed) ? kefir.constantError(ERR.JSON_PARSING(rawLine.substring(0, 80))) : kefir.constant(parsed)
            })
            .flatMap(({id, method = '', params = []}) => {
              let command = ({
                'mining.subscribe': stratumSession.subscribe.bind(stratumSession),
                'mining.authorize': stratumSession.authorize.bind(stratumSession),
                'mining.submit': stratumSession.submit.bind(stratumSession),
                'mining.multi_version': stratumSession.multiVersion.bind(stratumSession)
              }[method]) || (() => Promise.reject(ERR.UNIDENTIFIED_METHOD(method)))

              let sanitizedId = typeof id === 'string' ? id : parseInt(id && _.first(('' + id).match(/^[0-9]{0,15}$/i)), 10)
              params = Array.isArray(params) ? params : []
              return kefir
                .fromPromise(command(...(params || [])))
                .merge(kefir.later(method_call_timeout, ERR.METHOD_TIME_OUT(method)))
                .map((result) => ({id: sanitizedId, result, error: null}))
                .mapErrors((error) => Object.assign(error, {id: sanitizedId}))
                .take(1)
                .takeErrors(1)
            })

        // Return invocation responses
        kefir
          .merge([
            methodInvocationStream,
            kefir.fromEvents(stratumSession, 'notification')
          ])
          .flatMapErrors(({id, stratum_code = 20}) => kefir.constant({// eslint-disable-line camelcase
            id,
            result: null,
            error: createStratumError(stratum_code)
          })) // eslint-disable-line camelcase
          .takeUntilBy(socketCloseStream)
          .onValue((result) => {
            if (!socket.destroyed) {
              const message = [JSON.stringify(result), '\r\n'].join('')
              socket.write(message, 'utf8')
            }
          })

        // Destroy invalid sessions
        kefir.merge([
          socketErrorStream.take(1),
          methodInvocationStream.ignoreValues().filterErrors(_.matches({connectbtc_code: 'json_parsing_error'})).flatMapErrors(() => kefir.constant(1)).take(1),
          workerLoginExceedStream,
          submitTimeoutExceedStream,
          socketTimeoutStream
        ])
          .takeUntilBy(socketCloseStream)
          .onValue(() => socket.destroy())

        // Report events
        return kefir.merge([
          kefir.constant({type: 'connection_start', remote_ip: socket['remoteAddress']}),
          kefir.fromEvents(stratumSession, 'submit_new').map((event) => Object.assign({type: 'submit_new', remote_ip: socket['remoteAddress']}, event)),
          kefir.fromEvents(stratumSession, 'submit_error').map((event) => Object.assign(event, {type: 'submit_error'})),
          kefir.fromEvents(stratumSession, 'difficulty_set').map((event) => Object.assign({type: 'difficulty_set'}, event)),
          workerLoginExceedStream.map(() => ({type: 'worker_authorize_exceed'})),
          submitTimeoutExceedStream.map(() => ({type: 'submit_timeout', inactive: DEFAULT_SUBMIT_TIMEOUT})),
          socketTimeoutStream.map(() => ({type: 'socket_timeout', inactive: DEFAULT_SOCKET_TIMEOUT})),
          proxyStream.ignoreErrors(),
          socketErrorStream.map((error) => ({type: 'socket_error', error})),
          methodInvocationStream.ignoreValues().flatMapErrors((error) => kefir.constant(({
            type: 'invocation_error',
            error
          }))),
          kefir.fromEvents(stratumSession, 'session_initialize').map((event) => Object.assign({type: 'session_start'}, event)),
          kefir.fromEvents(stratumSession, 'session_terminate').map((event) => Object.assign({type: 'session_terminate'}, event)),
          kefir.fromEvents(stratumSession, 'worker_authorize').map((event) => Object.assign({type: 'worker_authorize'}, event)),
          kefir.fromEvents(stratumSession, 'session_subscribe').map((event) => Object.assign({type: 'session_subscribe'}, event))
        ]).takeUntilBy(socketCloseStream)
          .beforeEnd(() => ({type: 'connection_end'}))
          .map((obj) => Object.assign(obj, {connection_id: connectionId}))
      })

    serverStream
      .onValue((event) => this.emit('event', event))
  }
}
