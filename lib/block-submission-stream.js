const _ = require('lodash')
const bigInt = require('big-integer')
const TransactionInputModel = require('../model/bitcoin/transaction/input').Model

module.exports = (workerStream, templateCollection) =>
  workerStream
    .filter(_.matches({ type: 'submit_new' }))
    .map(({ template_id, nonce, ntime, extra_nonce_1, extra_nonce_2, hash, user_name }) => {
      let template = templateCollection.get(template_id)
      if (template && bigInt(hash, 16).leq(template.get('targetAsInt'))) {
        let templateClone = template.clone()
        let transactionCollectionClone = templateClone.get('transaction').clone()
        let coinbaseTransactionClone = transactionCollectionClone.shift().clone()
        let coinbaseTransactionInputCollectionClone = coinbaseTransactionClone.get('input').clone()

        let { message: coinbaseMessage, height: blockHeight } = coinbaseTransactionInputCollectionClone.at(0).getCoinbaseData()

        coinbaseTransactionInputCollectionClone.reset([TransactionInputModel.generateCoinbase(blockHeight, extra_nonce_1, extra_nonce_2, coinbaseMessage)])
        coinbaseTransactionClone.set({ input: coinbaseTransactionInputCollectionClone })
        transactionCollectionClone.unshift(coinbaseTransactionClone)

        templateClone.set({
          create: new Date(ntime),
          nonce: nonce,
          transaction: transactionCollectionClone,
          username: user_name,
          _hash: hash
        })
        return templateClone
      }
      return false
    })
    .filter(Boolean)
