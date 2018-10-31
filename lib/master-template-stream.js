const _ = require('lodash')
const uuidV4 = require('uuid/v4')
const rawBlockToTemplate = require('./raw-block-to-template')
const { getNextHexValue } = require('../lib/util')

module.exports = (coinBrokerStream, {deposit_address, coinbase_message, version: block_version}) =>
  coinBrokerStream
    .filter()
    .map((rawTemplateObj) => {
      return Object.assign(_.pick(rawTemplateObj, [
        'height',
        'target',
        'coinbasevalue',
        'curtime',
        'previousblockhash',
        'bits'
      ]), {
        'id': uuidV4(),
        'transactions': (rawTemplateObj['transactions'] || []),
        'default_witness_commitment': (rawTemplateObj['default_witness_commitment'] || null)
      })
    })
    .skipDuplicates(({ height: previousHeight }, { height: currentHeight }) => { return previousHeight > currentHeight })
    .map(rawBlockToTemplate({deposit_address, coinbase_message, block_version}))
    .diff((previous, current) => {
      const templateMark = getNextHexValue(previous.get('templateMark'))
      current.set('templateMark', templateMark)
      return {
        newHeight: previous.get('height') !== current.get('height'),
        template: current
      }
    }, {get: _.constant(-1)}
    )
