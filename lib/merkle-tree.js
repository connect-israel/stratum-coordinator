const crypto = require('crypto')
/*
 Ported from https://github.com/slush0/stratum-mining/blob/master/lib/merkletree.py
 */
const sha256 = function (buffer) {
  var hash1 = crypto.createHash('sha256')
  hash1.update(buffer)
  return hash1.digest()
}

const sha256d = function (buffer) {
  return sha256(sha256(buffer))
}

const range = function (start, stop, step) {
  if (typeof stop === 'undefined') {
    stop = start
    start = 0
  }
  if (typeof step === 'undefined') {
    step = 1
  }
  if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
    return []
  }
  var result = []
  for (var i = start; step > 0 ? i < stop : i > stop; i += step) {
    result.push(i)
  }
  return result
}

var MerkleTree = module.exports = function MerkleTree (data) {
  function merkleJoin (h1, h2) {
    var joined = Buffer.concat([h1, h2])
    var dhashed = sha256d(joined)
    return dhashed
  }
  // Used to calculate the steps for adding a coinbase later
  function calculateSteps (data) {
    var L = data
    var steps = []
    var PreL = [null]
    var StartL = 2
    var Ll = L.length

    if (Ll > 1) {
      while (true) {
        if (Ll === 1) break

        steps.push(L[1])

        if (Ll % 2) L.push(L[L.length - 1])

        var Ld = []
        var r = range(StartL, Ll, 2)
        r.forEach(function (i) {
          Ld.push(merkleJoin(L[i], L[i + 1]))
        })
        L = PreL.concat(Ld)
        Ll = L.length
      }
    }
    return steps
  }

  // Used to calculate merkle root without adding a coinbase later
  function calculateRoot (_data) {
    var data = _data // We dont want to work in-place
    // This is a recursive function
    if (data.length > 1) {
      if (data.length % 2 !== 0) data.push(data[data.length - 1])
      // Hash
      var newData = []
      for (var i = 0; i < data.length; i += 2) newData.push(merkleJoin(data[i], data[i + 1]))
      return calculateRoot(newData)
    } else return data[0]
  }

  this.data = data
  this.steps = calculateSteps(data)
  this.root = calculateRoot(data[0] == null ? data.slice(1) : data)
}

MerkleTree.prototype = {
  withFirst: function (f) {
    this.steps.forEach(function (s) {
      f = sha256d(Buffer.concat([f, s]))
    })
    return f
  }
}
