const _ = require('lodash')
const uuidV4 = require('uuid/v4')

module.exports = (workerStream) =>
  workerStream
    .filter(_.matches({ type: 'submit_new' }))
    .map(event => {
      let tmp = _.cloneDeep(event)
      tmp.id = uuidV4()
      tmp.type = 'share_new'
      tmp.work_time = tmp.time
      return tmp
    })
