const _ = require('lodash')
const Transaction = require('../model/bitcoin/transaction').Model
const TransactionCollection = require('../model/bitcoin/transaction').Collection
const config = require('config')
const kefir = require('kefir')

module.exports = incomingMessageStream =>
  kefir.merge(Object.keys(config['bitcoind']).map(coin =>
  incomingMessageStream
    .filter(_.matches({coin_type: coin}))
    .filter(_.matches({type: 'template_new'}))
    .diff((previous, current) => Object.assign({}, current, {'_new': +previous['height'] !== +current['height']}), {'height': -1})
    .map(({_new, coinbase, create, version, previous_hash, id, target, height, merkle_tree, coin_type, nbits, templateMark}) => ({
      template: [{
        id,
        previous_hash,
        height,
        target,
        version,
        nbits,
        create: new Date(create),
        transaction: new TransactionCollection([Transaction.import(coinbase)]),
        _merkle_array: merkle_tree.map((txt) => Buffer.from(txt, 'hex')),
        templateMark
      }],
      method: _new ? 'reset' : 'add',
      coinType: coin_type
    }))))
