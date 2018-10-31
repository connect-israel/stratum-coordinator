'use strict'
const chai = require('chai')
const sinonChai = require('sinon-chai')
const expect = chai.expect
chai.use(sinonChai)
const MiningCoinService = require('../../lib/services/mining-coin-service')
const WORKER_ID = '333'
const USER_NAME = 'wolfgang'
const sinon = require('sinon')
const redisService = {

}

const workersClient = {
  getWorker: async () => Promise.resolve(),
  setWorker: async () => Promise.resolve()
}

const miningCoinService = new MiningCoinService({redisService, workersClient})

describe('Mining coin service', () => {
  let sandbox = sinon.sandbox.create()

  afterEach(() => {
    sandbox.restore()
    delete process.env.MINING_MODE
  })
  it('Should return miningData from hard code "btc"', async () => {
    // Preparations
    const workerId = WORKER_ID
       // Execution
    let miningData = await miningCoinService.getMiningData({workerId})
    // Assertion
    expect(miningData).to.deep.equal({miningCoin: 'btc', miningMode: 'btc', nextMiningCoin: 'btc'})
    // Execution
    miningData = await miningCoinService.getMiningData({})
    // Assertion
    expect(miningData).to.deep.equal({miningCoin: 'btc', miningMode: 'btc', nextMiningCoin: 'btc'})

    // no next mining mode
    sandbox.stub(workersClient, 'getWorker')
      .withArgs(workerId).returns(Promise.reject(new Error('erorrrrrrr')).catch(() => {}))

    miningData = await miningCoinService.getMiningData({workerId: 1})
    expect(miningData).to.deep.equal({miningCoin: 'btc', miningMode: 'btc', nextMiningCoin: 'btc'})
  })

  it('Should return next mining when worker service has no mining coin and next', async () => {
    // Preparations
    const workerId = WORKER_ID
    // Execution
    // no next mining mode
    sandbox.stub(workersClient, 'getWorker')
        .withArgs({workerId, params: {}}).returns(Promise.resolve({mining_coin: null, mining_mode: 'bch', next_mining_coin: null}))

    let miningData = await miningCoinService.getMiningData({workerId})
    expect(miningData).to.deep.equal({miningCoin: 'bch', miningMode: 'bch', nextMiningCoin: 'bch'})
  })
  it('Should return next mining when worker service has no mining coin and next but auto', async () => {
    // Preparations
    const workerId = WORKER_ID
    // Execution
    // no next mining mode
    sandbox.stub(workersClient, 'getWorker')
      .withArgs({workerId, params: {}}).returns(Promise.resolve({mining_coin: null, mining_mode: 'auto', next_mining_coin: null}))

    let miningData = await miningCoinService.getMiningData({workerId})
    expect(miningData).to.deep.equal({miningCoin: 'btc', miningMode: 'auto', nextMiningCoin: 'btc'})
  })
  it('Should return miningData from environment when no default exists', async () => {
    // Preparations
    const workerId = WORKER_ID
    process.env.MINING_MODE = 'btccc'

    // Execution
    const miningData = await miningCoinService.getMiningData({workerId})
    // Assertion
    expect(miningData).to.deep.equal({miningCoin: 'btccc', miningMode: 'btccc', nextMiningCoin: 'btccc'})
  })
  it('Should return miningData from worker client by worker id', async () => {
    // Preparations
    const workerId = WORKER_ID
    sandbox.stub(workersClient, 'getWorker').withArgs({workerId, params: {}}).returns(Promise.resolve({mining_coin: 'btc', mining_mode: 'auto', next_mining_coin: 'bch'}))
    // Execution
    const miningData = await miningCoinService.getMiningData({workerId})
    // Assertion
    expect(miningData).to.deep.equal({miningCoin: 'btc', miningMode: 'auto', nextMiningCoin: 'bch'})
  })
  it('Should return miningData from worker client by user name', async () => {
    // Preparations
    const userName = USER_NAME
    sandbox.stub(workersClient, 'getWorker').withArgs({workerId: undefined, params: {userName: userName}}).returns(Promise.resolve({mining_coin: 'bch', mining_mode: 'bch'}))
    // Execution
    const miningData = await miningCoinService.getMiningData({userName})
    // Assertion
    expect(miningData).to.deep.equal({miningCoin: 'bch', miningMode: 'bch', nextMiningCoin: 'bch'})
  })
  it('Should update miningCoin from miningMode called from worker service', async () => {
    // Preparations
    const workerId = WORKER_ID
    const workersClientSpy = sandbox.spy(workersClient, 'setWorker')
    // Execution
    await miningCoinService.updateMiningCoinFromMiningMode({workerId, miningCoin: 'xyz'})

    // Assertion
    expect(workersClientSpy).to.have.been.calledWith(
      {
        id: workerId,
        miningCoin: 'xyz'
      }
    )
  })
})
