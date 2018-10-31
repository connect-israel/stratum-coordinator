const backbone = require('backbone')

const model = backbone.Model.extend({
  defaults: () => ({
    create: new Date(),
    valid: false,
    job: undefined,
    template: undefined,
    worker: undefined,
    error: undefined,
    from_cache: false
  })
})

module.exports = {
  Model: model,
  Collection: backbone.Collection.extend({ model })
}
