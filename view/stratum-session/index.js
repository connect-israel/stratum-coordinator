const _ = require('lodash')
const kefir = require('kefir')
const bigInt = require('big-integer')
const debug = require('debug')('connect-coordinator')

const UserModel = require('../../model/user').Model
const StratumSessionModel = require('../../model/stratum/session').Model
const TransactionInputModel = require('../../model/bitcoin/transaction/input').Model
const EventEmitter = require('events').EventEmitter
const dsha256 = require('../../lib/util').dsha256
const ERR = require('../errors')
const ReportJob = require('./report-job-stream')
const ReportNewDifficulty = require('./report-new-difficulty-stream')

const EXTRA_NONCE_2_SIZE = 4
const NTIME_MARGIN = 1800000
const DIFFICULTY_1 = bigInt('ffff0000000000000000000000000000000000000000000000000000', 16)
const LOG_IN_USER_LIMIT = 2

const ACTION_START = 'start'
const ACTION_RESET = 'reset'
const ACTION_ADD = 'add'

const SESSION = Symbol('Session')
const AUTHENTICATION_SERVICE = Symbol('AuthenticationService')

const SHARE_VALIDATION = require('../share-validation')(EXTRA_NONCE_2_SIZE, NTIME_MARGIN)

module.exports = class extends EventEmitter {
  constructor ({authenticationService, miningCoinService, templateCollections}) {
    super()
    let session = new StratumSessionModel()
    let jobCollection = session.get('job')
    let workerCollection = session.get('worker')
    this.miningCoinService = miningCoinService
    setImmediate(() => this.emit('session_initialize', {session_id: session.id}))

    Object.assign(this, {
      [SESSION]: session,
      [AUTHENTICATION_SERVICE]: authenticationService
    })

    const destroyStream = kefir
      .fromEvents(session, 'change:active')
      .filter((model) => !model.get('active'))
      .take(1)

    const subscriptionStream = kefir
      .fromEvents(session, 'change:subscribe')
      .takeUntilBy(destroyStream)
      .map(session => session.get('subscribe'))
      .filter(Boolean)
      .take(1)

    subscriptionStream.onValue(() => this.emit('session_subscribe', {
      session_id: session.id,
      agent_name: session.get('agentName')
    }))

    const submissionStream = kefir
      .fromEvents(session.get('submission'), 'add')
      .filter((submission) => !submission.get('from_cache'))
      .takeUntilBy(destroyStream)

    const userLoginStream = kefir
      .fromEvents(workerCollection, 'add')
      .takeUntilBy(destroyStream)

    const workerAuthorizationStream =
      userLoginStream
        .map(worker => worker.get('id'))
        .filter(Boolean)
        .take(1)

    const jobStream = kefir
      .fromEvents(jobCollection, 'all', (type, model) => {
        if (type === ACTION_RESET) model = model.at(0)
        return {type, model}
      })
      .filter(({model}) => !model.get('from_cache'))
      .takeUntilBy(destroyStream)
    // Add new jobs to job collection (with dedicated difficulty targets) as new templates arrive
    kefir
      .concat([
        workerAuthorizationStream.ignoreValues(),
        kefir.merge([
          kefir // get last template if exists (in initialization)
            .later(0)
            .flatMap(() => kefir.sequentially(0, _.compact(templateCollections.map(tc => {
              if (tc && tc.at(-1)) {
                return {
                  template: tc.at(-1),
                  coinType: tc.coinType
                }
              }
            }))))
            .map(({coinType, template}) => ({action: ACTION_START, template, coinType})),
          // add new templates
          ..._.compact([...templateCollections]) // add new templates
            .map(templateCollection =>
              kefir
                .fromEvents(templateCollection, ACTION_ADD, (...args) => ({
                  action: ACTION_ADD,
                  template: args[0], // Template
                  coinType: args[1].coinType // TemplateCollection
                }))),
          // get last template if 'reset' command
          ..._.compact([...templateCollections])
            .map(templateCollection =>
              kefir
                .fromEvents(templateCollection, ACTION_RESET)
                .map(collection => ({action: ACTION_RESET, template: collection.at(-1), coinType: collection.coinType})))
        ])
      ])
      .takeUntilBy(destroyStream)
      .onValue(({action, template, coinType}) => {
        this.isTemplateRelevantToSession({action, coinType, template})
          .then(isRelevant => {
            if (isRelevant) {
              action = action === ACTION_START ? ACTION_RESET : action
              if (action === ACTION_RESET) {
                session.get('submission').reset() // reset templates if reset command received
              }
              jobCollection[action]({template, difficulty: session.get('difficulty')})
            }
          })
          .catch(e => console.log(e))
      })
    ReportNewDifficulty({session, submissionStream, templateCollections, miningCoinService})
      .takeUntilBy(destroyStream)
      .onValue((difficulty) => {
        this.emit('difficulty_set', {session_id: session.id, difficulty})
        session.set('difficulty', difficulty)
      })

    // Report new jobs (add difficulty indication if needed)
    ReportJob(jobStream).onValue((event) => {
      return this.emit('notification', event)
    })

    // Notify of new share
    submissionStream
      .filter((submissionModel) => submissionModel.get('valid'))
      .onValue((submissionModel) => {
        let template = submissionModel.get('template')
        this.emit('submit_new', {
          create: submissionModel.get('create'),
          session_id: session.id,
          time: submissionModel.get('time'),
          nonce: template.get('nonce'),
          ntime: template.get('create').getTime(),
          extra_nonce_1: parseInt(session.id, 16),
          extra_nonce_2: (({nonce2}) => nonce2)(template.get('transaction').at(0).get('input').at(0).getCoinbaseData()),
          difficulty: submissionModel.get('job').get('difficulty'),
          worker_id: submissionModel.get('worker').id,
          worker_name: submissionModel.get('worker').get('name'),
          user_name: submissionModel.get('worker').get('user').get('name'),
          hash: submissionModel.get('hash'),
          template_id: template.id,
          height: template.get('height'),
          job_id: submissionModel.get('job').get('id'),
          coin_type: this[SESSION].get('miningCoin')
        })
      })

    submissionStream
      .filter(submissionModel => !submissionModel.get('valid'))
      .onValue(submissionModel =>
        this.emit('submit_error', Object.assign(submissionModel.get('error'), {
          worker_id: (submissionModel.get('worker') || {})['id'],
          worker_name: (submissionModel.get('worker') && submissionModel.get('worker').get('name')) || null,
          user_name: (submissionModel.get('worker') && submissionModel.get('worker').get('user').get('name')) || null,
          create: submissionModel.get('create'),
          session_id: session.id,
          difficulty: session.get('difficulty'),
          coin_type: this[SESSION].get('miningCoin')
        }, submissionModel.get('job') ? {
          job_id: submissionModel.get('job').id,
          difficulty: submissionModel.get('job').get('difficulty'),
          expire: submissionModel.get('job').get('expire'),
          newDifficulty: submissionModel.get('job').get('newDifficulty'),
          from_cache: submissionModel.get('job').get('from_cache'),
          cleanJobs: submissionModel.get('job').get('cleanJobs')
        } : {})))

    userLoginStream
      .onValue((workerModel) => this.emit('worker_authorize', {
        id: workerModel.id,
        session_id: session.id,
        worker_name: workerModel.get('name'),
        user_name: workerModel.get('user').get('name')
      }))

    userLoginStream
      .scan((sum) => sum + 1, 0)
      .filter((sum) => sum >= LOG_IN_USER_LIMIT)
      .take(1)
      .onValue((count) => this.emit('worker_authorize_exceed', {
        session_id: session.id,
        type: 'worker_authorize_exceed'
      }))
  }

  async isTemplateRelevantToSession ({action, coinType: templateCoinType, template}) {
    if (this[SESSION].get('worker').length === 0) {
      return false
    }

    const worker = this[SESSION].get('worker').at(0)
    const workerId = worker.get('id')
    const userName = worker.get('user').get('name')

    if (!shouldCheckMinerMininigMode({action, workerId, template})) {
      return this[SESSION].get('miningCoin') === templateCoinType
    }

    try {
      const {miningCoin, nextMiningCoin} = await this.miningCoinService.getMiningData({workerId, userName})
      let isRelevant = false
      if (miningCoin === nextMiningCoin && nextMiningCoin !== templateCoinType) {
        return isRelevant
      } else {
        isRelevant = true
        this[SESSION].set('miningCoin', miningCoin)
        if (nextMiningCoin === templateCoinType && miningCoin !== templateCoinType) {
          await this.miningCoinService.updateMiningCoinFromMiningMode({workerId, miningCoin: nextMiningCoin})
          this[SESSION].set('miningCoin', nextMiningCoin)
          this[SESSION].get('submission').reset()
          debug('Reset Submissions')
        }
      }
      return isRelevant
    } catch (e) {
      throw new Error(`Error at isCoinTypeRelevantToSession: ${e}`)
    }
  }

  subscribe (userAgentNameAndVersion, extraNonce1) {
    let session = this[SESSION]
    session.set({
      'subscribe': true,
      'agentName': userAgentNameAndVersion
    })
    return Promise.resolve(
      [
        [['mining.set_difficulty', '1'], ['mining.notify', '1']],
        session.id,
        EXTRA_NONCE_2_SIZE
      ]
    )
  }

  authorize (username, password) {
    let session = this[SESSION]
    if (!session.get('subscribe')) return Promise.reject(ERR.NOT_SUBSCRIBED('authorize'))
    return kefir
      .fromPromise(this[AUTHENTICATION_SERVICE].authenticateWorker(username, password))
      .map(({id, name, user: {name: userName}}) => {
        return !!session.get('worker').add({
          id,
          name,
          user: new UserModel({name: userName})
        })
      })
      .flatMapErrors(() => kefir.constantError(ERR.UNAUTHORIZED_WORKER(username, password)))
      .toPromise()
  }

  submit (username, jobId, pExtraNonce2, pNtime, pNonce) {
    const session = this[SESSION]
    const submissionTimestamp = Date.now()

    if (!session.get('subscribe')) return Promise.reject(ERR.NOT_SUBSCRIBED('submit'))

    const jobCollection = session.get('job')
    const workerCollection = session.get('worker')
    const submissionCollection = session.get('submission')
    // Validate input (light tasks first)
    const {error, job, nonce, extraNonce2, ntime, worker} =
      validateMinerInput({
        jobCollection,
        workerCollection,
        jobId,
        username,
        ntime: pNtime,
        nonce: pNonce,
        extraNonce2: pExtraNonce2
      })

    if (error) {
      submissionCollection.add({
        valid: false,
        worker,
        error: JSON.parse(JSON.stringify(error)),
        jobId
      })
      return Promise.reject(error)
    }

    // Assemble new template
    const template = job.get('template')
    const templateClone = template.clone()
    const transactionCollectionClone = templateClone.get('transaction').clone()
    const coinbaseTransactionClone = transactionCollectionClone.shift().clone()
    const coinbaseTransactionInputCollectionClone = coinbaseTransactionClone.get('input').clone()

    const {message: coinbaseMessage, height: blockHeight} = coinbaseTransactionInputCollectionClone.at(0).getCoinbaseData()
    coinbaseTransactionInputCollectionClone.reset([TransactionInputModel.generateCoinbase(blockHeight, parseInt(session.id, 16), extraNonce2, coinbaseMessage)])
    coinbaseTransactionClone.set({input: coinbaseTransactionInputCollectionClone})
    transactionCollectionClone.unshift(coinbaseTransactionClone)

    templateClone.set({
      create: new Date(ntime),
      nonce: nonce,
      transaction: transactionCollectionClone
    })

    // PERFORMANCE TWEAK: Calculating templateHash according to a pre-calculated merkle root that's derived from the ORIGINAL template's "CoinbaseAssemblyMerkleArray"
    const templateHash = templateClone
      .getHash(template.getCoinbaseAssemblyMerkleArray().reduce((a, b) => dsha256(Buffer.concat([a, b])), dsha256(Buffer.from(coinbaseTransactionClone.toHexString(), 'hex')))
        .toString('hex'))

    // Perform hash validations
    if (bigInt(templateHash, 16).gt(DIFFICULTY_1.divide(job.get('difficulty')))) {
      const error = ERR.LOW_DIFFICULTY_SHARE(worker.id, template.id, DIFFICULTY_1.divide(job.get('difficulty')).toString(16), templateHash)
      submissionCollection.add({
        valid: false,
        worker,
        error,
        job
      })
      return Promise.reject(error)
    }

    if (submissionCollection.findWhere({hash: templateHash})) {
      const error = ERR.DUPLICATE_SHARE(worker.id, templateHash)
      submissionCollection.add({
        valid: false,
        worker,
        error,
        job
      })
      return Promise.reject(error)
    }

    const previousTimestamp = (_.last(submissionCollection.where({worker})) || job).get('create').getTime()

    submissionCollection.add({
      time: submissionTimestamp - previousTimestamp,
      valid: true,
      job: job,
      worker: worker,
      template: templateClone,
      hash: templateHash
    })

    return Promise.resolve(true)
  }

  multiVersion () {
    return Promise.resolve(true)
  }

  terminate () {
    const session = this[SESSION]
    this.emit('session_terminate', {session_id: session.id})
    session.set({active: false}).off()
    this.removeAllListeners()
  }
}

const
  validateMinerInput = (data) => {
    for (let {failIf, error, generator = _.noop} of SHARE_VALIDATION) {
      if (failIf(data)) {
        return Object.assign(data, {error: error(data)})
      }
      Object.assign(data, generator(data))
    }
    return Object.assign(data, {success: true})
  }

const shouldCheckMinerMininigMode = ({action, workerId, template}) => {
  if (action === 'start') {
    return true
  } else {
    debug(`Template marked with id: ${template.get('templateMark')}, workerId: ${workerId}`)
    if (workerId.slice(-1) === template.get('templateMark')) {
      return true
    }
    return false
  }
}
