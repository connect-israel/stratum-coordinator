const _ = require('lodash')
const backbone = require('backbone')

const model = backbone.Model.extend({
  defaults: () => ({
    create: new Date(),
    template: undefined,
    worker: undefined,
    value: 0,
    valid: false
  }),
  initialize: function () {
    this.getHash = _.memoize(function () {
      return this.get('template').getHash()
    })
  }
})

module.exports = {
  Model: model,
  Collection: backbone.Collection.extend({ model })
}
