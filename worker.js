const _ = require('lodash')
const kefir = require('kefir')
const BlockCollection = require('./model/bitcoin/block').Collection
const UserService = require('./lib/user-service-mock')
const StratumServerView = require('./view/stratum-tcp-server')
const blocksToTemplateStream = require('./lib/worker-template-stream')

module.exports = ({config, incomingMessageStream, mineModeService}) => {
  // Creating the BlockCollection Object for the worker
  // Interface is:
  //  Events: add, reset
  //  Methods: getCoinbaseAssemblyMerkleArray, toHexString, getMerkleRoot, blockHeaderToHexString, getHash
  const templateCollections = config['coin_types'].map(coinType => new BlockCollection([], {coinType: coinType}))
  // Creating the User Object
  // Interface is:
  //  Events: worker_update
  //  Methods: authenticateWorker
  const userService = new UserService()
  // Creates a startum server for the worker
  const stratumServer = new StratumServerView(_.defaults(config, {authenticationService: userService}),
    templateCollections, mineModeService)

  // Indicate that the worker is running and ready to receive templates
  process.send({type: 'process_start'})

  // Update local template collection
  blocksToTemplateStream(incomingMessageStream).onValue(({method, template, coinType}) => {
    const templateCollection = templateCollections.find(tc => tc.coinType === coinType)
    templateCollection[method](template)
  })

  kefir.merge([
    kefir.fromEvents(stratumServer, 'event'),
    kefir.fromEvents(userService, 'worker_update').map(({id, name: worker_name, user: {name: user_name}}) => ({
      type: 'worker_update',
      id,
      worker_name,
      user_name
    }))
  ])
    .onValue(process.send.bind(process))
}
