const backbone = require('backbone')
const crypto = require('crypto')
const Job = require('./job')
const Worker = require('../worker')
const Submission = require('./submission')

const model = backbone.Model.extend({
  defaults: () => ({
    create: new Date(),
    submission: new Submission.Collection(),
    worker: new Worker.Collection(),
    job: new Job.Collection(),
    subscribe: false,
    agentName: '',
    difficulty: 32768, // 262144, // 65536, // 44000,
    id: crypto.randomBytes(4).toString('hex'),
    active: true,
    miningMode: ''
  })
})

module.exports = {
  Model: model,
  Collection: backbone.Collection.extend({ model })
}
