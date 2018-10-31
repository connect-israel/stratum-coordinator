const _ = require('lodash')
const backbone = require('backbone')
const parseWorkerUsername = require('../lib/util').parseWorkerUsername

const model = backbone.Model.extend({
  defaults: () => ({
    name: '',
    user: undefined
  }),
  getLoginName: function () {
    return [this.get('user').get('name'), this.get('name')].join('.')
  }
})

const collection = backbone.Collection.extend({
  model,
  findByLoginName: function (loginName) {
    let { userName, workerName } = parseWorkerUsername(loginName)
    return (this
      .filter((workerModel) => (workerModel.get('user') || { get: _.noop }).get('name') === userName)
      .filter((workerModel) => workerModel.get('name') === workerName) || [])[0]
  }
})

module.exports = {
  Model: model,
  Collection: collection
}
