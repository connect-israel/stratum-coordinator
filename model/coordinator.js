const backbone = require('backbone')
const BlockCollection = require('./bitcoin/block').Collection
const WorkerCollection = require('./worker').Collection

module.exports = backbone.Model.extend({
  defaults: () => ({
    template: new BlockCollection(),
    worker: new WorkerCollection()
  })
})
