const _ = require('lodash')
const kefir = require('kefir')
const { encodeAsHexBytes } = require('../../lib/util')

const createResponseStream = (job) => {
  let jobsToReport = []
  job.get('newDifficulty') && jobsToReport.push({
    method: 'mining.set_difficulty',
    params: [job.get('difficulty')],
    id: null
  })
  jobsToReport.push({
    method: 'mining.notify',
    params: [
      job.id,
      _(job.get('template').get('previous_hash').split('')).chunk(8).map(part => part.join('')).reverse().join(''),
      ...job.get('template').get('transaction').at(0).toHexString().split('1122334455667788'),
      job.get('template').getCoinbaseAssemblyMerkleArray().map(buf => buf.toString('hex')),
      encodeAsHexBytes(4, job.get('template').get('version').toString(16)),
      job.get('template').get('nbits'),
      encodeAsHexBytes(4, Math.floor(job.get('template').get('create').getTime() / 1000).toString(16)),
      (job.get('cleanJobs'))
    ],
    id: null
  })
  return kefir.sequentially(0, jobsToReport)
}

const markIfCleanJob = (previous, current) => {
  let newDifficulty = previous.model.get('difficulty') !== current.model.get('difficulty')
  let newHeight = previous.model.get('template').get('height') < current.model.get('template').get('height')
  let cleanJobs = newDifficulty || newHeight
  current.model.set('newDifficulty', newDifficulty)
  current.model.set('cleanJobs', cleanJobs)
  return current.model
}

module.exports = job$ =>
  job$
  .filter(({ type, model }) => ~['add', 'reset'].indexOf(type))
  .diff(markIfCleanJob, { model: { get: param => param === 'difficulty' ? -1 : { get: () => -1 } } })
  .flatMapConcat(job => createResponseStream(job))
