const bigInt = require('big-integer')
const DIFFICULTY_1 = bigInt(require('../../util').DIFFICULTY_1, 16)

module.exports = (templateStream, address) =>
  templateStream
    .map((blockModel) => {
      let coinbase = blockModel.get('transaction').at(0)
      let transactionAmount = coinbase.getTotalOut()
      let depositAddress = address
      let { message } = coinbase.get('input').at(0).getCoinbaseData()

      return {
        'type': 'template_new',
        'id': blockModel.id,
        'create': blockModel.get('create'),
        'height': blockModel.get('height'),
        'transaction_count': blockModel.get('transaction').size(),
        'transaction_amount': transactionAmount,
        'default_witness_commitment': blockModel['default_witness_commitment'],
        'difficulty': DIFFICULTY_1.divide(bigInt(blockModel.get('target'), 16)).valueOf(),
        'coinbase_deposit_address': depositAddress,
        'coinbase_message': message
      }
    })
