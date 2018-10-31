const kefir = require('kefir')
const redisStreams = require('../../lib/redis-streams')

module.exports = ({session, templateCollection, redisClient}) => {
  // Creating streams from collections
  let destroy$ = kefir
    .fromEvents(session, 'change:active')
    .filter((model) => !model.get('active'))
    .take(1)

  let submission$ = kefir
    .fromEvents(session.get('submission'), 'add')
    .takeUntilBy(destroy$)

  let worker$ = kefir
    .fromEvents(session.get('worker'), 'add')
    .takeUntilBy(destroy$)

  let job$ = kefir
    .fromEvents(session.get('job'), 'all', (type, model) => {
      if (type === 'reset') model = model.at(0)
      return { type, model }
    })
    .takeUntilBy(destroy$)

  let templateReset$ = kefir
    .fromEvents(templateCollection, 'reset')
    .takeUntilBy(destroy$)

  // Getting redis Streams
  let redis = redisStreams(redisClient)

  // Saving data to cache streams
  let cacheSubmission$ = workerId =>
    submission$
      .filter(submission => (submission.get('valid') && !submission.get('from_cache')))
      .flatMap(submission => redis.redisHset$(workerId, submission.get('hash'), JSON.stringify(submission)))
      // .map(event => ({ type: 'cache_submission', worker_id: workerId, event }))

  let cacheJob$ = workerId =>
    job$
      .filter(({ type }) => ~['add', 'reset'].indexOf(type))
      .filter(({ model }) => !model.get('from_cache'))
      .flatMap(({ model }) => redis.redisHset$(workerId, model.id, JSON.stringify(model)))
      // .map(event => ({ type: 'cache_job', worker_id: workerId, event }))

  let clearCache$ = workerId =>
    templateReset$
      .flatMap((template) => redis.redis$('del', workerId))
      .map(event => ({ type: 'clear_cache', worker_id: workerId, event }))

  let saveCache$ = workerId =>
    kefir.merge([ cacheSubmission$(workerId), cacheJob$(workerId), clearCache$(workerId) ])

  // Loading data from caching streams
  let getHashTable$ = hkey =>
    redis.redis$('hkeys', hkey)
      .flatMap(keys => kefir.sequentially(0, keys))
      .flatMap(key => redis.redisHget$(hkey, key))

  let getWorkerHashTable$ = workerId =>
    getHashTable$(workerId)
      .map(model => JSON.parse(model))
      .filter(model => model.template.height >= templateCollection.at(0).get('height'))

  let getSubmission$ = workerId =>
    getWorkerHashTable$(workerId)
      .filter(model => model.valid)
      .map(submission => session.get('submission').add(Object.assign(submission, { from_cache: true })))
      .map(model => ({ type: 'load_submission_from_cache', submission_hash: model.get('hash') }))

  let getJob$ = workerId =>
    getWorkerHashTable$(workerId)
      .filter(model => !model.valid)
      .map(job => session.get('job').add(Object.assign(job, { from_cache: true })))
      .map(model => ({ type: 'load_job_from_cache', job_id: model.id }))

  let loadCache$ = workerId =>
    kefir.merge([ getSubmission$(workerId), getJob$(workerId) ]).beforeEnd(() => ({ type: 'loading_cache_completed', worker_id: workerId }))

  // Returning stream
  return worker$.flatMap(worker => kefir.concat([ loadCache$(worker.id), saveCache$(worker.id) ])).filter((event) => event.type)
}
