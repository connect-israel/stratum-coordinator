'use strict'
const kefir = require('kefir')
const jf = require('jsonfile')
const path = require('path')
const bitcoinBlocksToMasterTemplateStream = require(path.join(__dirname, '../../lib/master-template-stream'))
const bitcoinBlocksToWorkerTemplateStream = require(path.join(__dirname, '../../lib/worker-template-stream'))

const config = jf.readFileSync(path.join(__dirname, '../../config/default.json'))
config.block = {
  'version': '536870914',
  'coinbase_message': '/ConnectBTC - Home for Miners/',
  'deposit_address': 'mxbnAXF76MNbChErLzYBFpAuzpReixrmyt'
}

const createWorkerTemplateStream = (coinBlocks, coinType, templateMark) => {
  coinBlocks = coinBlocks.reduce(function (current, block) {
    current.push(block.request)
    return current
  }, [])
  let blockStream = kefir.sequentially(0, coinBlocks)
  let masterTemplateStream = bitcoinBlocksToMasterTemplateStream(blockStream, config.block)
    .map(({template}) => ({
      'type': 'template_new',
      'target': template.get('target'),
      'create': template.get('create').getTime(),
      'version': template.get('version'),
      'previous_hash': template.get('previous_hash'),
      'height': template.get('height'),
      'id': template.id,
      'coinbase': template.get('transaction').at(0).toHexString(),
      'merkle_tree': template.getMerkleTree(),
      'nbits': template.get('nbits'),
      'coin_type': coinType,
      'templateMark': templateMark
    }))
  return bitcoinBlocksToWorkerTemplateStream(masterTemplateStream)
}

module.exports = createWorkerTemplateStream
