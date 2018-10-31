const _ = require('lodash')
const backbone = require('backbone')
const decodeVariableLengthInteger = require('../../../lib/util').decodeVariableLengthInteger
const encodeAsHexBytes = require('../../../lib/util').encodeAsHexBytes
const encodeAsHexNearestBytes = require('../../../lib/util').encodeAsHexNearestBytes
const wrapWithVariableLength = require('../../../lib/util').wrapWithVariableLength
const toHexString = require('../../../lib/util').toHexString
const bcoin = require('bcoin')

const model = backbone.Model.extend({
  isCoinbase: function () {
    return this.get('input').isCoinbase()
  },
  getCoinbaseData: function () {
    if (this.isCoinbase()) {
      let s = this.get('input').script.toJSON()
      let heightLength = decodeVariableLengthInteger(s)
      s = s.split('')
      s.splice(0, heightLength.len * 2)
      let height = parseInt(bcoin.utils.util.revHex(s.splice(0, heightLength.value * 2).join('')), 16)
      let nonce1 = parseInt(s.splice(0, 4 * 2).join(''), 16)
      let nonce2 = parseInt(s.splice(0, 4 * 2).join(''), 16)
      return {height, nonce1, nonce2, message: Buffer.from(s.join(''), 'hex').toString('ascii')}
    } else {
      throw (new Error('Not a coinbase transaction'))
    }
  },
  toHexString: function () {
    return this.get('input').toRaw('hex').toString('hex')
  }
}, {
  generateCoinbase: function (height, nonce1, nonce2, message) {
    let encodeHeight = _.flow(toHexString, encodeAsHexNearestBytes, bcoin.utils.util.revHex, wrapWithVariableLength)
    let encodeNonce = _.flow(toHexString, encodeAsHexBytes(4))

    let rawScript = [
      encodeHeight(height),
      encodeNonce(nonce1),
      encodeNonce(nonce2),
      Buffer.from(message, 'utf8').toString('hex')
    ].join('')

    let prevout = new bcoin.primitives.Outpoint('0000000000000000000000000000000000000000000000000000000000000000', 0xffffffff)
    let script = bcoin.script.fromRaw(Buffer.from(rawScript, 'hex'))
    let options = { prevout, script, sequence: 0xffffff }
    let input = new bcoin.primitives.Input(options)

    return new this({ 'input': input })
  }
})

module.exports = {
  Model: model,
  Collection: backbone.Collection.extend({model})
}
