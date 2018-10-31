const backbone = require('backbone')
const InputTransactionCollection = require('./transaction/input').Collection
const InputTransactionModel = require('./transaction/input').Model
const OutputTransactionCollection = require('./transaction/output').Collection
const OutputTransactionModel = require('./transaction/output').Model
const bcoin = require('bcoin')

const model = backbone.Model.extend({
  defaults: () => ({
    version: 1,
    input: new InputTransactionCollection(),
    output: new OutputTransactionCollection(),
    _tx: null,
    locktime: 0
  }),
  initialize: function () {
    this.set('_tx', new bcoin.primitives.TX({
      version: this.get('version'),
      locktime: this.get('locktime'),
      inputs: this.get('input').map((input) => input.get('input')),
      outputs: this.get('output').map((output) => output.get('output'))
    }))
  },
  getTotalOut: function () {
    return this.get('_tx').getOutputValue()
  },
  toHexString: function () {
    const result = new bcoin.primitives.TX({
      version: this.get('version'),
      locktime: this.get('locktime'),
      inputs: this.get('input').map((input) => input.get('input')),
      outputs: this.get('output').map((output) => output.get('output'))
    })
    return result.toRaw('hex').toString('hex')
  }
}, {
  import: function (hexStr) {
    let data = Buffer.from(hexStr, 'hex')
    let tx = bcoin.primitives.TX.fromRaw(data)

    let version = tx.version
    let input = tx.inputs.map((input) => {
      const inputModel = new InputTransactionModel({input})
      return inputModel
    })
    let output = tx.outputs.map((output) => new OutputTransactionModel({output}))
    let locktime = tx.locktime

    const result = new this({
      version,
      input: new InputTransactionCollection(input),
      output: new OutputTransactionCollection(output),
      locktime
    })

    return result
  },
  generateCoinbaseP2PKH: function ({default_witness_commitment, sum, depositAddress, height, nonce1, nonce2, message}) {
    const outputsArr = []

    // connect-btc wallet output
    const address = bcoin.address.fromBase58(depositAddress)
    const script = bcoin.script.fromAddress(address)
    const output = new bcoin.output({script, value: sum}) // eslint-disable-line
    outputsArr.push(new OutputTransactionModel({output}))

    if (default_witness_commitment) { // eslint-disable-line
      const buffer = Buffer.alloc(default_witness_commitment.length / 2, default_witness_commitment, 'hex')
      const witnessScript = bcoin.script.fromRaw(buffer, 'hex')
      const witnessOutput = new bcoin.output({script: witnessScript, value: 0}) // eslint-disable-line
      outputsArr.push(new OutputTransactionModel({output: witnessOutput}))
    }
    let template = new this({
      input: new InputTransactionCollection([InputTransactionModel.generateCoinbase(height, nonce1, nonce2, message, default_witness_commitment)]),
      output: new OutputTransactionCollection(outputsArr)
    })
    return template
  }
})

module.exports = {
  Model: model,
  Collection: backbone.Collection.extend({model})
}
