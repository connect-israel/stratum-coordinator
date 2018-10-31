const path = require('path')
const kefir = require('kefir')
const expect = require('chai').expect
const jf = require('jsonfile')
const _ = require('lodash')
const sinon = require('sinon')

const UserService = require(path.join(__dirname, '../../lib/user-service-mock'))
const BlockCollection = require(path.join(__dirname, '../../model/bitcoin/block')).Collection
const StratumSession = require(path.join(__dirname, '../../view/stratum-session'))
const createWorkerTemplateStream = require(path.join(__dirname, '../handlers/worker-template-handler'))

const userAgentNameAndVersion = 'miner.worker'
const testUsername = 'user.worker'
const testPassword = 'testingpassword'
const extraNonce1 = 'ABC123'
const nonValidUserName = 'testingMinerPassword'
const nonValidPassword = 'ABC123'
const COIN_TYPE_BTC = 'btc'
const COIN_TYPE_BCH = 'bch'
const COIN_TYPE_BRC = 'brc'

let userService = new UserService()
const miningCoinService = {
  getMiningData: async () => ({
    miningMode: 'auto',
    miningCoin: COIN_TYPE_BTC,
    nextMiningCoin: COIN_TYPE_BTC
  }),
  getMiningCoin: async () => COIN_TYPE_BTC,
  getNextMininigCoin: async () => COIN_TYPE_BTC,
  updateMiningCoinFromMiningMode: () => null
}

const blocks = jf.readFileSync(path.join(__dirname, './blocks.json'))
const expectedJobs = jf.readFileSync(path.join(__dirname, './expected-jobs.json'))
const blocksBCH = jf.readFileSync(path.join(__dirname, './blocks-bch.json'))
const expectedJobsBCH = jf.readFileSync(path.join(__dirname, './expected-jobs-bch.json'))
const errorsMockFile = jf.readFileSync(path.join(__dirname, './errors.json'))

describe('Testing Stratum Session', function () {
  let stratumSession
  let sessionId
  const templateCollectionBTC = new BlockCollection([], {coinType: COIN_TYPE_BTC})
  const templateCollectionBCH = new BlockCollection([], {coinType: COIN_TYPE_BCH})
  // let workerId
  // let jobs = []
  let sandbox = sinon.sandbox.create()
  const templateCollections = {}
  templateCollections[COIN_TYPE_BTC] = templateCollectionBTC
  templateCollections[COIN_TYPE_BCH] = templateCollectionBCH

  let testAndSetSessionID = function (func) {
    stratumSession.once('session_initialize', function (event) {
      sessionId = event.session_id
      expect(sessionId).to.not.be.empty // eslint-disable-line
      func()
    })
  }

  beforeEach(function (done) {
    stratumSession = new StratumSession({
      authenticationService: userService,
      templateCollections: [templateCollectionBTC, templateCollectionBCH],
      miningCoinService
    })
    testAndSetSessionID(done)
  })
  afterEach(function () {
    stratumSession.terminate()
    Object.values(templateCollections).forEach(tc => tc.reset())
    sandbox.restore()
  })
  it('should fail to submit before subscribe', function (done) {
    stratumSession.submit(testUsername)
      .then()
      .catch(function (err) {
        expect(err.connectbtc_code).to.deep.equal('not_subscribed')
        expect(err.stratum_code).to.deep.equal(25)
        expect(err.method).to.deep.equal('submit')
        done()
      })
  })

  it('should not authorize user for session without subscribing', function (done) {
    stratumSession
      .authorize(testUsername, testPassword)
      .then()
      .catch(function (err) {
        expect(err).to.deep.equal({
          connectbtc_code: 'not_subscribed',
          stratum_code: 25,
          method: 'authorize'
        })
        done()
      })
  })

  it('should subscribe to session', function (done) {
    kefir.fromEvents(stratumSession, 'session_subscribe')
      .map(function (event) { return Object.assign({type: 'session_subscribe'}, event) })
      .onValue(function (event) {
        expect(event.session_id).to.equal(sessionId)
        expect(event.agent_name).to.equal(userAgentNameAndVersion)
        done()
      })
    stratumSession.subscribe(userAgentNameAndVersion, extraNonce1)
  })

  it('adding template to session', function (done) {
    let end = _.after(2, done)

    let jobs$ = kefir.fromEvents(stratumSession, 'notification')
    let expectedJobs$ = kefir.sequentially(0, expectedJobs)

    kefir.zip([jobs$, expectedJobs$], function (job, expectedJob) {
      let {jobClone, expectedJobClone} = {jobClone: _.cloneDeep(job), expectedJobClone: _.cloneDeep(expectedJob)}
      let expectedJobId
      if (job.method === 'mining.notify') {
        jobClone.params.shift()
        expectedJobId = expectedJobClone.params.shift()
      }
      expect(jobClone.method).to.deep.equal(expectedJobClone.method, `Failed on ${expectedJobId}`)
      expect(jobClone.params).to.deep.equal(expectedJobClone.params, `Failed on ${expectedJobId}`)
    }).take(expectedJobs.length).onValue(() => true).onEnd(end())
    stratumSession.subscribe(userAgentNameAndVersion, extraNonce1)
    stratumSession
      .authorize(testUsername, testPassword)
      .then(function (worker) {
        end()
      })
    createWorkerTemplateStream(blocks, COIN_TYPE_BTC).onValue(({template}) => {
      return templateCollectionBTC.add(template)
    }).onError(err => done(err))
  })

  it('should terminate session', function (done) {
    kefir
      .fromEvents(stratumSession, 'session_terminate')
      .onValue(function (event) {
        expect(event.session_id).to.equal(sessionId)
        done()
      })
    stratumSession.terminate()
  })

  it('should recover session after disconnection', function (done) {
    let end = _.after(3, done)

    let templateCollection1 = new BlockCollection([], {coinType: COIN_TYPE_BTC})
    let templateCollection2 = new BlockCollection([], {coinType: 'noop'})
    stratumSession = new StratumSession({
      authenticationService: userService,
      templateCollections: [templateCollection1, templateCollection2],
      miningCoinService
    })

    testAndSetSessionID(end)

    let jobs$ = kefir.fromEvents(stratumSession, 'notification')
    let expectedJobs$ = kefir.sequentially(0, expectedJobs)

    kefir.zip([jobs$, expectedJobs$], function (job, expectedJob) {
      let {jobClone, expectedJobClone} = {jobClone: _.cloneDeep(job), expectedJobClone: _.cloneDeep(expectedJob)}
      job.method === 'mining.notify' && jobClone.params.shift() && expectedJobClone.params.shift()
      expect(jobClone.method).to.deep.equal(expectedJobClone.method)
      expect(jobClone.params).to.deep.equal(expectedJobClone.params)
      return job
    })
      .take(expectedJobs.length)
      .filter(function (job) {
        return job.method === 'mining.notify'
      })
      .onEnd(() => end())

    stratumSession.subscribe(userAgentNameAndVersion, extraNonce1)
      .then(() => {
        stratumSession
          .authorize(testUsername, testPassword)
          .then(function (worker) {
            createWorkerTemplateStream(blocks, COIN_TYPE_BTC, '3').onValue(function ({template}) {
              templateCollection1.add(template)
            })
            end()
          })
      })
  })

  it('should not authorize user for session', function (done) {
    stratumSession.authorize(nonValidUserName, nonValidPassword)
      .catch(function (err) {
        expect(err.connectbtc_code).to.equal('not_subscribed')
        expect(err.stratum_code).to.equal(25)
        done()
      })
  })

  it('should authorize user for session', function (done) {
    let end = _.after(2, done)
    stratumSession.once('worker_authorize', function (worker) {
      expect(worker.id).to.exist // eslint-disable-line
      // workerId = worker.id
      expect(worker.session_id).to.exist // eslint-disable-line
      let [userName, workerName] = testUsername.split('.')
      expect(worker.worker_name).to.equal(workerName)
      expect(worker.user_name).to.equal(userName)
      end()
    })
    stratumSession.subscribe(userAgentNameAndVersion, extraNonce1)
      .then(() => {
        stratumSession
          .authorize(testUsername, testPassword)
          .then(function (worker) {
            end()
          })
      })
      .catch(err => console.log(err))
  })

  it('should warn about too many workers for session', function (done) {
    let end = _.after(3, done)
    let testUsername2 = testUsername + 1
    stratumSession.once('worker_authorize_exceed', function (err) {
      expect(err.type).to.equal('worker_authorize_exceed')
      end()
    })
    stratumSession.once('worker_authorize', function (worker) {
      expect(worker.id).to.exist // eslint-disable-line
      expect(worker.session_id).to.exist // eslint-disable-line
      let [userName, workerName] = testUsername2.split('.')
      expect(worker.worker_name).to.equal(workerName)
      expect(worker.user_name).to.equal(userName)
      end()
    })
    stratumSession.subscribe(userAgentNameAndVersion, extraNonce1)
      .then(() => {
        stratumSession
          .authorize(testUsername2, testPassword)
          .then(function (worker) {
            end()
          })
          .catch(err => console.log(err))
        stratumSession
          .authorize(testUsername2, testPassword)
          .then(function (worker) {
            end()
          })
          .catch(err => console.log(err))
      })
      .catch(err => console.log(err))
  })

  it('should handle multi version message', function () {
    return stratumSession.multiVersion()
  })

  // Strimline multiple templates (different coins) - worker should only receive relevant templates
  it('should create a new jobs based on templates coming from relevant broker (coin) the miner is currently mining', function (done) {
    let end = _.after(2, done)
    let jobs$ = kefir.fromEvents(stratumSession, 'notification')
    let expectedJobs$ = kefir.sequentially(0, expectedJobs)

    kefir.zip([jobs$, expectedJobs$], function (job, expectedJob) {
      let {jobClone, expectedJobClone} = {jobClone: _.cloneDeep(job), expectedJobClone: _.cloneDeep(expectedJob)}
      job.method === 'mining.notify' && jobClone.params.shift() && expectedJobClone.params.shift()
      expect(jobClone.method).to.deep.equal(expectedJobClone.method)
      expect(jobClone.params).to.deep.equal(expectedJobClone.params)
      return job
    })
      .take(expectedJobs.length)
      .filter(function (job) {
        return job.method === 'mining.notify'
      })
      .onEnd(() => end())
    stratumSession.subscribe(userAgentNameAndVersion, extraNonce1)
      .then(() => {
        stratumSession
          .authorize(testUsername, testPassword)
          .then(function (worker) {
            [COIN_TYPE_BCH, COIN_TYPE_BTC, COIN_TYPE_BRC].forEach(coinType => {
              createWorkerTemplateStream(blocks, coinType, '3').onValue(({template, coinType}) => {
                if (coinType === COIN_TYPE_BTC) {
                  templateCollectionBTC.add(template)
                } else {
                  templateCollectionBCH.add(template)
                }
              })
            })
            end()
          })
      })
  })

  it('should create a new jobs while not checking the worker mining mode', function (done) {
    let end = _.after(1, done)
    let jobs$ = kefir.fromEvents(stratumSession, 'notification')
    let expectedJobs$ = kefir.sequentially(0, expectedJobs)
    kefir.zip([jobs$, expectedJobs$], function (job, expectedJob) {
      let {jobClone, expectedJobClone} = {jobClone: _.cloneDeep(job), expectedJobClone: _.cloneDeep(expectedJob)}
      job.method === 'mining.notify' && jobClone.params.shift() && expectedJobClone.params.shift()
      expect(jobClone.method).to.deep.equal(expectedJobClone.method)
      expect(jobClone.params).to.deep.equal(expectedJobClone.params)
      return job
    })
      .take(expectedJobs.length)
      .filter(function (job) {
        return job.method === 'mining.notify'
      })
      .onEnd(() => end())
    stratumSession.subscribe(userAgentNameAndVersion, extraNonce1)
      .then(() => {
        createWorkerTemplateStream([blocks[0]], COIN_TYPE_BTC, 'c').onValue(({template}) => {
          templateCollectionBTC.add(template)
          stratumSession
            .authorize(testUsername, testPassword)
            .then(end())
        })
      })
  })

  it('should create a new jobs in case the mining mode of the worker is AUTO and a new templates arrives (next mining coin)', function (done) {
    // Preparations
    let end = _.after(2, done)
    let jobs$ = kefir.fromEvents(stratumSession, 'notification')
    let expectedJobs$ = kefir.sequentially(0, expectedJobsBCH)
    sandbox.stub(miningCoinService, 'getMiningData')
      .returns(Promise.resolve({
        'miningMode': 'auto',
        'miningCoin': COIN_TYPE_BTC
      }))
    sandbox.stub(miningCoinService, 'getNextMininigCoin')
      .returns(Promise.resolve(COIN_TYPE_BCH))

    // Execution
    stratumSession.subscribe(userAgentNameAndVersion, extraNonce1)
      .then(() => {
        stratumSession
          .authorize(testUsername, testPassword)
          .then(function (worker) {
            [COIN_TYPE_BCH, COIN_TYPE_BRC].forEach(coinType => {
              createWorkerTemplateStream(blocksBCH, coinType, '3').onValue(({template, coinType, method}) => {
                if (templateCollections[coinType]) {
                  templateCollections[coinType][method](template)
                }
              })
            })
            sandbox.restore()
            sandbox.stub(miningCoinService, 'getMiningData')
              .returns(Promise.resolve({
                'miningMode': 'auto',
                'miningCoin': COIN_TYPE_BCH
              }))
            createWorkerTemplateStream(blocks, COIN_TYPE_BTC).onValue(({template, COIN_TYPE_BTC, method}) => {
              if (templateCollections[COIN_TYPE_BTC]) {
                templateCollections[COIN_TYPE_BTC][method](template)
              }
            })
            end()
          })
      })
    // Assertion
    kefir.zip([jobs$, expectedJobs$], function (job, expectedJob) {
      let {jobClone, expectedJobClone} = {jobClone: _.cloneDeep(job), expectedJobClone: _.cloneDeep(expectedJob)}
      job.method === 'mining.notify' && jobClone.params.shift() && expectedJobClone.params.shift()
      expect(jobClone.method).to.deep.equal(expectedJobClone.method)
      expect(jobClone.params).to.deep.equal(expectedJobClone.params)
      return job
    })
      .take(expectedJobsBCH.length)
      .filter(function (job) {
        return job.method === 'mining.notify'
      })
      .onEnd(() => end())
  })
  it('should ignore creating new jobs after miningCoin has changed', function (done) {
    // Preparations
    let end = _.after(2, done)
    let jobs$ = kefir.fromEvents(stratumSession, 'notification')
    let expectedJobs$ = kefir.sequentially(0, expectedJobsBCH)
    sandbox.stub(miningCoinService, 'getMiningData')
      .returns(Promise.resolve({
        'miningMode': 'auto',
        'miningCoin': COIN_TYPE_BTC
      }))
    sandbox.stub(miningCoinService, 'getNextMininigCoin')
      .returns(Promise.resolve(COIN_TYPE_BCH))

    // Execution
    stratumSession.subscribe(userAgentNameAndVersion, extraNonce1)
      .then(() => {
        stratumSession
          .authorize(testUsername, testPassword)
          .then(function (worker) {
            [COIN_TYPE_BCH, COIN_TYPE_BRC].forEach(coinType => {
              createWorkerTemplateStream(blocksBCH, coinType, '3').onValue(({template, coinType}) => {
                if (templateCollections[coinType]) {
                  templateCollections[coinType].add(template)
                }
              })
            })
            sandbox.restore()
            sandbox.stub(miningCoinService, 'getMiningData')
              .returns(Promise.resolve({
                'miningMode': 'auto',
                'miningCoin': COIN_TYPE_BCH
              }))
            createWorkerTemplateStream(blocks, COIN_TYPE_BTC).onValue(({template, COIN_TYPE_BTC}) => {
              if (templateCollections[COIN_TYPE_BTC]) {
                templateCollections[COIN_TYPE_BTC].add(template)
              }
            })
            end()
          })
      })
    // Assertion
    kefir.zip([jobs$, expectedJobs$], function (job, expectedJob) {
      let {jobClone, expectedJobClone} = {jobClone: _.cloneDeep(job), expectedJobClone: _.cloneDeep(expectedJob)}
      job.method === 'mining.notify' && jobClone.params.shift() && expectedJobClone.params.shift()
      expect(jobClone.method).to.deep.equal(expectedJobClone.method)
      expect(jobClone.params).to.deep.equal(expectedJobClone.params)
      return job
    })
      .take(expectedJobsBCH.length)
      .filter(function (job) {
        return job.method === 'mining.notify'
      })
      .onEnd(() => end())
  })
  errorsMockFile.forEach(function (errorMock) {
    let testError = function (err, expectedError, startTime, verbose) {
      expect(err.stratum_code).to.deep.equal(expectedError.stratum_code)
      expect(err.connectbtc_code).to.deep.equal(expectedError.connectbtc_code)
      expect(err.username).to.deep.equal(expectedError.username)
      expect(err.password).to.deep.equal(expectedError.password)
      expect(err.extra_nonce_2).to.deep.equal(expectedError.pExtraNonce2)
      expect(err.nonce).to.deep.equal(expectedError.pNonce)
      expect(err.ntime).to.deep.equal(expectedError.pNtime)
      if (verbose) {
        expect(err.session_id).to.deep.equal(sessionId)
        err.worker_id && expect(err.worker_id).to.deep.equal(expectedError.workerId)
        expect(err.create.getTime()).to.be.most((new Date()).getTime()).and.to.be.least(startTime.getTime())
      } else {
        expect(err.session_id).to.be.undefined // eslint-disable-line
        expect(err.worker_id).to.be.undefined // eslint-disable-line
        expect(err.create).to.be.undefined // eslint-disable-line
      }
    }

    let testString = `${errorMock[1].connectbtc_code} error for ${errorMock[1].errMsg}`
    it.only('should return ' + testString, function (done) {
      let end = _.after(3, done)
      let miliseconds = 1000
      let now = new Date()
      let submitError$ = kefir.fromEvents(stratumSession, 'submit_error').take(1)

      let {username, jobId, pExtraNonce2, pNtime, pNonce} = (mock => {
        if (!mock || Object.keys(mock).length === 0) return {username: mock}
        if (mock.pNtime === true) mock.pNtime = (Math.floor((new Date()).getTime() / miliseconds)).toString(16)
        if (mock.jobId === true) {
          mock.jobId = 'a8321de2'// jobs[0].params[0]
        }
        if (mock.pNtime === 'fromTemplate') {
          let templateNtime = templateCollectionBTC.at(0).get('create').getTime()
          mock.pNtime = (Math.floor(templateNtime / miliseconds)).toString(16)
        }
        return mock
      })(errorMock[0])
      if (username === testUsername) {
        delete errorMock[1].username
      }
      submitError$.onValue(function (err) {
        testError(err, errorMock[1], now, true)
        end()
      })
      kefir.fromEvents(stratumSession, 'notification')
        .filter(function (job) {
          return job.method === 'mining.notify'
        })
        .onValue(function (job) {
          stratumSession
            .submit(username, jobId, pExtraNonce2, pNtime, pNonce)
            .catch(function (err) {
              let verbose = err.stratum_code === 23 || err.stratum_code === 22
              testError(err, errorMock[1], now, verbose)
              end()
            })
        })
        .onEnd(() => end())
      stratumSession.subscribe(userAgentNameAndVersion, pExtraNonce2)
        .then(() => {
          stratumSession
            .authorize(testUsername, testPassword)
            .then(() => {
              createWorkerTemplateStream(blocks, COIN_TYPE_BTC).onValue(function ({template}) {
                templateCollectionBTC.add(template)
              })
            })
        })
        .catch(err => console.log(err))
    })
  })
})
