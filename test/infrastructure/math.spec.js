'use strict'
const chai = require('chai')
const expect = chai.expect
const bigInt = require('big-integer')

describe('Big integer', () => {
  it('test 1', () => {
    expect(bigInt('100').divide(2).valueOf()).to.equal(50)
  })
  it('test 2', () => {
    const diff = bigInt('ffff0000000000000000000000000000000000000000000000000000', 16)
    const jobDiff = 32768
    console.log(diff.divide(jobDiff).valueOf())

    const diff2 = bigInt('32', 16)
    const jobDiff2 = 4
    console.log(diff2.divide(jobDiff2).valueOf())

    expect(10).to.equal(10)

  })
})
