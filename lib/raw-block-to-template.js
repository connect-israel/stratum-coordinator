const _ = require('lodash')
const BlockModel = require('../model/bitcoin/block').Model
const Transaction = require('../model/bitcoin/transaction').Model
const TransactionCollection = require('../model/bitcoin/transaction').Collection
const MerkleTree = require('./merkle-tree')
const bcoin = require('bcoin')

module.exports = ({deposit_address, coinbase_message = '/aaa/', default_witness_commitment, block_version}) => // eslint-disable-line camelcase
  ({
     id,
     default_witness_commitment,
     previousblockhash: previous_hash,
     height,
     target,
     curtime,
     transactions,
     coinbasevalue,
     bits: nbits
   }) => {
    const deserializedTransactions = _(transactions).map('data').map((transaction) => Transaction.import(transaction)).value()
    const blockModel = new BlockModel({
      id,
      previous_hash,
      version: parseInt(block_version),
      height,
      target,
      default_witness_commitment,
      nbits,
      create: new Date(curtime * 1000),
      transaction: new TransactionCollection([
        Transaction.generateCoinbaseP2PKH({
          default_witness_commitment,
          sum: coinbasevalue,
          depositAddress: deposit_address,
          height,
          nonce1: 0x11223344,
          nonce2: 0x55667788,
          message: coinbase_message
        })
      ].concat(deserializedTransactions)),
      '_merkle_array': _(transactions)
        .map('txid')
        .map(bcoin.utils.util.revHex)
        .map((hash) => Buffer.from(hash, 'hex'))
        .thru((arr) => (new MerkleTree([null, ...arr]))['steps'])
        .value()
    })
    return blockModel
  }
