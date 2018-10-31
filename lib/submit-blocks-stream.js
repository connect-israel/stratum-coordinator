const kefir = require('kefir')
// Fix error handeling to correspond to the actual way bitcoind reports errors
module.exports = (blockSubmissionEventStream, bitcoinBroker, coinType) =>
  blockSubmissionEventStream.flatMap(template => {
    let templateHex = template.toHexString()
    let submit$ = kefir.fromNodeCallback((cb) => bitcoinBroker.submitBlock(templateHex, cb))
    let success$ = submit$.filter(err => !err)
    let failed$ = submit$.filter(err => err)
    return kefir.merge([
      success$.map(res => ({ type: 'block_new', success: true, hash: template.get('_hash'), username: template.get('username'), coinType: coinType, time: new Date().toUTCString(), res: 'block submitted' })),
      failed$.map(err => ({ type: 'block_new', success: false, hash: template.get('_hash'), username: template.get('username'), coinType: coinType, time: new Date().toUTCString(), err }))
    ])
  })
