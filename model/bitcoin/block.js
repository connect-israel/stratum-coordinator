const _ = require('lodash')
const backbone = require('backbone')
const Transaction = require('./transaction')
const makeMerkle = require('../../lib/util').makeMerkle
const encodeAsHexBytes = require('../../lib/util').encodeAsHexBytes
const encodeVariableLengthInteger = require('../../lib/util').encodeVariableLengthInteger
const dsha256 = require('../../lib/util').dsha256
const bigInt = require('big-integer')
const bcoin = require('bcoin')

const model = backbone.Model.extend({
  defaults: () => ({
    'create': undefined,
    'transaction': new Transaction.Collection(),
    'default_witness_commitment': undefined,
    'previous_hash': '',
    'height': 0,
    'target': 'FFFFFF000000000000000000000000',
    'nonce': 0,
    '_create': new Date(),
    '_merkle_array': undefined,  // Used for optimization (pre-calculated tree)
    '_targetAsInt': undefined // // Used for optimization (pre-target as number)
  }),
  targetAsInt: function () {
    if (!this.get('_targetAsInt')) this.set('_targetAsInt', bigInt(this.get('target'), 16))
    return this.get('_targetAsInt')
  },
  get: function (attr) {
    if (typeof this[attr] === 'function') {
      return this[attr]()
    }
    return backbone.Model.prototype.get.call(this, attr)
  },
  getCoinbaseAssemblyMerkleArray: function () {
    const merkleArray = this.get('_merkle_array') || ((merkleArray) => {
      this.set('_merkle_array', merkleArray)
      return merkleArray
    })(_(this
      .get('transaction')
      .map((transactionModel) => transactionModel.toHexString()))
      .chain()
      .map((str) => Buffer.from(str, 'hex'))
      .reduce((ac, v) => {
        ac[0].push(v)
        return ac
      }, [[]])
      .map(makeMerkle)
      .flatten()
      .slice(1)
      .reverse()
      .map((arr) => arr[1])
      .compact()
      .value())

    return merkleArray
  },
  toHexString: function () {
    let body = [
      this.blockHeaderToHexString(),
      encodeVariableLengthInteger(this.get('transaction').length),
      this.get('transaction').map((transactionModel) => transactionModel.toHexString()).join('')
    ].join('')

    return body.toUpperCase()
  },
  getMerkleTree: function () {
    return this.getCoinbaseAssemblyMerkleArray().map((hashBuffer) => hashBuffer.toString('hex'))
  },
  getMerkleRoot: function () {
    const test = this.getCoinbaseAssemblyMerkleArray()
    let x = test.reduce((a, b) => dsha256(Buffer.concat([a, b])), dsha256(Buffer.from(this.get('transaction').at(0).toHexString(), 'hex')))
      .toString('hex')
    return x
  },
  blockHeaderToHexString: function (merkleRoot) {
    return [
      _.flow(encodeAsHexBytes(4), bcoin.utils.util.revHex)(this.get('version').toString(16)),
      bcoin.utils.util.revHex(this.get('previous_hash')),
      merkleRoot || this.getMerkleRoot(),
      _.flow(encodeAsHexBytes(4), bcoin.utils.util.revHex)((this.get('create').getTime() / 1000).toString(16)),
      bcoin.utils.util.revHex(this.get('nbits')),
      _.flow(encodeAsHexBytes(4), bcoin.utils.util.revHex)(this.get('nonce').toString(16))
    ].join('')
  },
  getHash: function (merkleRoot) {
    return _.flow(dsha256, (b) => b.toString('hex'), bcoin.utils.util.revHex)(Buffer.from(this.blockHeaderToHexString(merkleRoot), 'hex'))
  }
})

module.exports = {
  Model: model,
  Collection: backbone.Collection.extend({
    model: model,
    initialize: function (models, options) {
      options || (options = {})
      if (options.coinType) {
        _.extend(this, _.pick(options, 'coinType'))
      }
    }
  })
}
