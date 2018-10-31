const kefir = require('kefir')

module.exports = redisClient =>
  ({
    redisHset$: (hkey, key, value) => kefir.fromNodeCallback(cb => redisClient.hset(hkey, key, value, cb)),
    redisHget$: (hkey, key) => kefir.fromNodeCallback(cb => redisClient.hget(hkey, key, cb)),
    redis$: (method, key) => kefir.fromNodeCallback(cb => redisClient[method](key, cb))
  })
