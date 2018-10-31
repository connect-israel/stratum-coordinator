const backbone = require('backbone')
const crypto = require('crypto')

const model = backbone.Model.extend({
  defaults: () => ({
    id: crypto.randomBytes(4).toString('hex'),
    template: undefined,
    difficulty: 1,
    create: new Date(),
    expire: false,
    newDifficulty: false,
    from_cache: false
  })
})

module.exports = {
  Model: model,
  Collection: backbone.Collection.extend({ model })
}
