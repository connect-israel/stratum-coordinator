'use strict'
const EventEmitter = require('events').EventEmitter
const DEFAULT_MINING_COIN = 'btc'
module.exports = class extends EventEmitter {
  constructor ({workersClient}) {
    super()
    this.workersClient = workersClient
  }

  async getMiningData ({workerId, userName}) {
    let miningMode, miningCoin, nextMiningCoin
    try {
      let params = userName ? {userName} : {}
      let worker = await this.workersClient.getWorker({workerId, params})
      if (worker) {
        miningMode = worker.mining_mode
        miningCoin = worker.mining_coin
        nextMiningCoin = worker.next_mining_coin
      }
    } catch (error) {
      console.log(`Get mining data failed with workers service. workerId: ${workerId}. Error: ${error}`)
    }
    if (!miningMode) {
      miningMode = process.env.MINING_MODE
    }
    if (!miningMode) {
      miningMode = miningCoin = nextMiningCoin = DEFAULT_MINING_COIN
      return {miningMode, miningCoin, nextMiningCoin}
    }
    if (!miningCoin) {
      miningCoin = this._getMissingMiningType(miningMode)
    }
    if (!nextMiningCoin) {
      nextMiningCoin = this._getMissingMiningType(miningCoin)
    }
    return {miningMode, miningCoin, nextMiningCoin}
  }
  _getMissingMiningType (miningType) {
    if (miningType === 'auto') {
      return DEFAULT_MINING_COIN
    } else {
      return miningType
    }
  }

  async getMiningCoin ({workerId, userName}) {
    const {miningCoin} = await this.getMiningData({workerId, userName})
    return miningCoin
  }

  async getMiningMode ({workerId, userName}) {
    const {miningMode} = await this.getMiningData({workerId, userName})
    return miningMode
  }

  async updateMiningCoinFromMiningMode ({workerId, miningCoin}) {
    try {
      await this.workersClient.setWorker({id: workerId, miningCoin})
    } catch (error) {
      console.log(`error saving mining coin ${error}`)
    }
  }
}
