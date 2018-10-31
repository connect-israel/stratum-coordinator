const _ = require('lodash')
const crypto = require('crypto')
const leftPad = require('left-pad')

function decodeVariableLengthInteger (hexString) {
  let bytes = hexString.match(/.{1,2}/g)
  let key = parseInt(bytes.shift(), 16)
  let len = Math.pow(2, Math.max(key - 0xfc, 0)) // (key < 0xfd ? 0 : Math.pow(2, key-0xfc)) + 1

  return {
    len: len > 1 ? len + 1 : len,
    value: len === 1 ? key : parseInt(bytes.slice(0, len).reverse().join(''), 16)
  }
}

function encodeVariableLengthInteger (value) {
  let hexStrArr = value.toString(16).split('')
  if (value < 0xFD) {
    return encodeAsHexBytes(1, value.toString(16))
  } else {
    let extender = [2, 4, 8].findIndex((bytes) => hexStrArr.length / 2 <= bytes) + 1
    return (0xFC + extender).toString(16) + Array(16).fill('0')
      .concat(hexStrArr)
      .slice(Math.pow(2, extender) * -2)
      .reduce((function () {
        let buffer = []
        return function (ac, cur, index) {
          buffer.push(cur)
          if ((index + 1) % 2 === 0) {
            ac.push(buffer.splice(0))
          }
          return ac
        }
      })(), [])
      .reverse()
      .map((arr) => arr.join(''))
      .join('')
  }
}

function encodeAsHexNearestBytes (hexStr) {
  let hexArr = hexStr.split('')
  return ['0'].concat(hexArr).slice(-Math.ceil(hexArr.length / 2) * 2).join('')
}

const encodeAsHexBytes = _.curry((bytes, hexStr) => leftPad(hexStr, bytes * 2, '0').slice(-bytes * 2))

const sha256 = (data) => crypto.createHash('sha256').update(data).digest()
const dsha256 = _.flow(sha256, sha256)

function makeMerkle (arr) {
  let tree = []
  const makeBranch = function (prevLevel) {
    let curLevel = _(prevLevel)
      .map(dsha256)
      .tap((level) => tree.push(level))
      .chunk(2)
      .map((douple) => { douple = douple.concat([douple[0]]).slice(0, 2); return Buffer.concat(douple) })
      .value()

    return prevLevel.length > 1 ? makeBranch(curLevel) : tree.reverse()
  }
  return makeBranch(arr)
}

const getNextHexValue = (value) => value ? ((parseInt(value, 16) + 1) % 16).toString(16) : 0

module.exports = {
  decodeVariableLengthInteger,
  encodeVariableLengthInteger,
  encodeAsHexBytes,
  wrapWithVariableLength: (hexString) => [encodeVariableLengthInteger(Math.round(hexString.length / 2)), hexString].join(''),
  encodeAsHexNearestBytes,
  toHexString: (value) => value.toString(16),
  makeMerkle,
  sha256,
  dsha256,
  parseWorkerUsername: (authorizeString) => _.zipObject(['userName', 'workerName'], ((authorizeString + '').match(/^([a-z0-9]{3,20})\.([a-z0-9]{1,20})$/i) || []).slice(1)),
  DIFFICULTY_1: 'ffff0000000000000000000000000000000000000000000000000000',
  getNextHexValue
}
