const _ = require('lodash')
const ERR = require('./errors')

module.exports = (EXTRA_NONCE_2_SIZE, NTIME_MARGIN) => {
  return [
    {
      failIf: ({ username }) => !username || !/^[0-9a-z]+.[0-9a-z]+$/i.test(username),
      generator: ({ username, workerCollection }) => ({ worker: workerCollection.findByLoginName(username) }),
      error: ({ username }) => ERR.WORKER_NAME_MALFORMAT(username)
    },
    {
      failIf: ({ worker }) => !worker,
      error: ({ username }) => ERR.UNAUTHORIZED_WORKER(username)
    },
    {
      failIf: ({ extraNonce2 }) => !new RegExp(`^[0-9a-f]{${EXTRA_NONCE_2_SIZE * 2}}$`, 'i').test(extraNonce2),
      generator: ({extraNonce2}) => ({ extraNonce2: parseInt(extraNonce2, 16) }),
      error: ({ extraNonce2 }) => ERR.EXTRA_NONCE_2_MALFORMAT(extraNonce2)
    },
    {
      failIf: ({ nonce }) => !/^[0-9a-f]{1,16}$/i.test(nonce),
      generator: ({nonce}) => ({ nonce: parseInt(nonce, 16) }),
      error: ({ nonce }) => ERR.NONCE_MALFORMAT(nonce)
    },
    {
      failIf: ({ ntime }) => !/^[0-9a-f]{1,16}$/i.test(ntime),
      generator: ({ntime}) => ({ ntime: parseInt(ntime, 16) * 1000 }),
      error: ({ ntime }) => ERR.NTIME_MALFORMAT(ntime)
    },
    {
      failIf: ({ jobId }) => !/^[0-9a-f]{1,16}$/i.test(jobId),
      generator: ({ jobId, jobCollection }) => ({ job: jobCollection.get(jobId) }),
      error: ({ jobId }) => ERR.JOBID_MALFORMAT(jobId)
    },
    {
      failIf: ({ job }) => !job,
      error: ({ jobId }) => ERR.JOB_NOT_FOUND(jobId)
    },
    {
      failIf: ({ job, ntime }) => {
        let baseTime = job.get('template').get('create').getTime()
        return !_.inRange(ntime, baseTime - NTIME_MARGIN, baseTime + NTIME_MARGIN)
      },
      error: ({ job, ntime }) => ERR.NTIME_OUT_OF_RANGE(job.get('template').id, job.get('template').get('create').getTime(), ntime)
    }
  ]
}
