const backbone = require('backbone')

const model = backbone.Model.extend({
  defaults: () => ({
    name: ''
  })
})

module.exports = {
  Model: model,
  Collection: backbone.Collection.extend({ model })
}
