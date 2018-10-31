const {format, createLogger, transports} = require('winston')
const {combine, timestamp} = format

const logger = createLogger({
  format: combine(timestamp(), format.json())
})
//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//

if (process.env.NODE_ENV !== 'test') {
  logger.add(new transports.Console({
    format: format.json()
  }))
}

module.exports = logger
