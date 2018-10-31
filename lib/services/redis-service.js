'use strict'
const EventEmitter = require('events').EventEmitter

const bluebird = require('bluebird')
const redis = require('redis')
bluebird.promisifyAll(redis.RedisClient.prototype)
bluebird.promisifyAll(redis.Multi.prototype)

const KEY_EXPIRY = 24 * 60 * 60

module.exports = class extends EventEmitter {
  constructor ({host, port}) {
    super()
    // TODO remove hard coded port and host
    this.client = redis.createClient({host, port, db: 0})
    this.client.on('connect', () => {
      console.log('connection to redis has been established')
    })
    this.client.on('ready', () => {
      console.log('connection to redis is ready')
    })
    this.client.on('error', (err) => {
      console.log(`connection to redis has been failed: ${err}`)
    })
  }

  get (key) {
    return this.client.getAsync(key)
  }

  getHash (key) {
    return this.client.hgetallAsync(key)
  }

  setHash ({key, values}) {
    return this.client.multi()
      .hmset(key, values)
      .expire(key, KEY_EXPIRY)
      .execAsync()
  }
}
