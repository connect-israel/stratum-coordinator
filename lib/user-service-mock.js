const EventEmitter = require('events')
const crypto = require('crypto')
const parseWorkerUsername = require('./util').parseWorkerUsername

const USER_ID_SECRET = 'zXt/e(H`uGK%VC8w'

// This simulates a unique worker UUID for identical user+worker pairs (allows unregistered submissions to be processed and later attributes to registered users+workers).
// NOTICE: Since a uuid is used to identify workers, the SHA256 hash is truncated and molded as UUID v4
module.exports = class extends EventEmitter {
  authenticateWorker (userNameAndWorkerName, password) {
    let { userName, workerName } = parseWorkerUsername(userNameAndWorkerName)

    return userName ? ((hmac) => {
      let obj = {
        id: hmac
          .update(`${userName.toLowerCase()}|${workerName.toLowerCase()}`)
          .digest('hex')
          .match(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})/i)
          .slice(1)
          .join('-'),
        name: workerName,
        user: { name: userName }
      }
      this.emit('worker_update', obj)
      return Promise.resolve(obj)
    })(crypto.createHmac('sha256', USER_ID_SECRET)) : Promise.reject() // eslint-disable-line
  }
}
