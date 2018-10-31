const _ = require('lodash')
const bigInt = require('big-integer')
const kefir = require('kefir')

const DIFFICULTY_1 = bigInt('ffff0000000000000000000000000000000000000000000000000000', 16)
const SHARE_MIN_DIFFICULTY = 4096 // 65536
const SHARE_TARGET_TIME = 20000

module.exports = ({session, submissionStream, templateCollections, miningCoinService}) => {
  const destroyStream = kefir
    .fromEvents(session, 'change:active')
    .filter((model) => !model.get('active'))
    .take(1)

  // get coin from session and take the relevant templateCollection
  const templatesAdd$ = kefir.merge(templateCollections
    .map(templateCollection => kefir.fromEvents(templateCollection, 'add', (...args) => ({
      action: 'add',
      template: args[0],
      coinType: args[1].coinType
    }))))
  const templatesReset$ = kefir.merge(
    templateCollections
      .map(templateCollection => kefir
        .fromEvents(templateCollection, 'reset')
        .map(collection => ({action: 'reset', coinType: collection.coinType}))
      ))
  const template$ = kefir.merge([templatesAdd$, templatesReset$])
  // Calculate new Difficulty
  let tc
  return submissionStream
    .filter(submission => submission.get('valid'))
    .diff((prev, cur) =>
      ({
        difficulty: cur.get('job').get('difficulty'),
        time: cur.get('create').getTime() - prev.get('create').getTime()
      }), session)
    .slidingWindow(20, 10)
    .sampledBy(kefir.stream((emitter) => {
      template$
        .takeUntilBy(destroyStream)
        .onValue(event => {
          try {
            if (!session.get('worker').at(0)) {
              return emitter.end()
            }
            if (event.coinType === session.get('miningCoin')) {
              tc = templateCollections.find(t => t.coinType === event.coinType)
              emitter.emit(true)
            }
          } catch (err) {
            console.log(`Error in report-new-difficulty-stream: ${err}`)
          }
        })
    }))
    .map(samples => samples.reduce((a, b) => ({
      difficulty: a.difficulty + b.difficulty,
      time: a.time + b.time
    }), {difficulty: 0, time: 0}))
    .map(totalShares => Math.pow(2, Math.round(Math.log2(SHARE_TARGET_TIME * (totalShares.difficulty / totalShares.time)))))
    .map(difficulty => _.clamp(difficulty, SHARE_MIN_DIFFICULTY, DIFFICULTY_1.divide(bigInt(tc.last().get('target'), 16))))
    .diff((previous, current) => previous - current ? current : null, -1)
    .filter(Boolean)
}
