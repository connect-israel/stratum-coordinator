const backbone = require('backbone')

const model = backbone.Model.extend({
  toHexString: function () {
    return this.get('output').toRaw('hex').toString('hex')
  }
})

module.exports = {
  Model: model,
  Collection: backbone.Collection.extend({ model })
}
