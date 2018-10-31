const kefir = require('kefir')
const redisStreams = require('./redis-streams')

module.exports = ({templateCollection, redisClient, hkey}) => {
  let templateReset$ = kefir.fromEvents(templateCollection, 'reset')
    .map(collection => collection.at(0)).filter(Boolean)
    .filter(template => !template.get('from_cache'))

  let templateAdd$ = kefir.fromEvents(templateCollection, 'add').filter(template => !template.get('from_cache'))
  let redis = redisStreams(redisClient)

  // Saving templates to cache
  let addTemplateToCache$ = template => {
    return redis.redisHset$(hkey, template.id, JSON.stringify(template.toJSON()))
      .map(event => ({ type: 'cache_template', template_id: template.id, event }))
  }

  let clearTemplateCache$ = template =>
    redis.redis$('del', hkey)
      .flatMap((event) => addTemplateToCache$(template))
      .map(event => ({ type: 'clear_template_cache', event }))

  return kefir.merge([
    templateReset$.flatMap(template => clearTemplateCache$(template)),
    templateAdd$.flatMap(template => addTemplateToCache$(template))
  ])
}
