const path = require('path')
const kefir = require('kefir')
const jsonfile = require('jsonfile')
const uuid = require('uuid')
const _ = require('lodash')

const BlockCollection = require(path.join(__dirname, '../../model/bitcoin/block')).Collection
const TemplateToBlock = require(path.join(__dirname, '../../lib/raw-block-to-template'))
const TemplateToBlock$ = require(path.join(__dirname, '../../lib/master-template-stream'))

const expect = require('chai').expect
const Job = require(path.join(__dirname, '../../model/stratum/job')).Model
const UserModel = require(path.join(__dirname, '../../model/user')).Model
const Submission = require(path.join(__dirname, '../../model/stratum/submission')).Model
const GetDifficulty$ = require(path.join(__dirname, '../../view/stratum-session/report-new-difficulty-stream'))
const workerTemplate$ = require(path.join(__dirname, '../../lib/worker-template-stream'))
const reportJob$ = require(path.join(__dirname, '../../view/stratum-session/report-job-stream'))
const Block = require(path.join(__dirname, '../../model/bitcoin/block')).Model
const Session = require(path.join(__dirname, '../../model/stratum/session')).Model

const config = {
  coinbase_message: '/ConnectBTC - Home for Miners/',
  deposit_address: 'mxbnAXF76MNbChErLzYBFpAuzpReixrmyt',
  block_version: '536870914'
}
const COIN_TYPE = 'btc'
const miningCoinService = {
  getMiningCoin: async () => COIN_TYPE
}

const templateToBlock = TemplateToBlock(config)

let getBlock$ = (blocks, time = 0) => {
  return kefir.sequentially(time, blocks.map((blockTemplate) => blockTemplate.request))
}

let blocksToWorkerTemplate$ = function (block$) {
  return workerTemplate$(TemplateToBlock$(block$, Object.assign(config, {version: config.block_version}))
    .map(function (startumTemplate) {
      let template = startumTemplate.template
      return {
        'type': 'template_new',
        'target': template.get('target'),
        'create': template.get('create').getTime(),
        'version': template.get('version'),
        'previous_hash': template.get('previous_hash'),
        'height': template.get('height'),
        'id': template.id,
        'coinbase': template.get('transaction').at(0).toHexString(),
        'merkle_tree': template.getMerkleTree()
      }
    })
  )
}

describe('Converting Raw Bitcoin block to full template for master', function () {
  const blockTemplates = jsonfile.readFileSync(path.join(__dirname, '/blockTemplatesMaster.json'))

  let testTemplate = function (resultTemplate, referenceTemplate) {
    expect(resultTemplate.previous_hash).to.deep.equal(referenceTemplate.previous_hash)
    expect(resultTemplate.height).to.deep.equal(referenceTemplate.height)
    expect(resultTemplate.version).to.deep.equal(referenceTemplate.version)
    expect(resultTemplate.target).to.deep.equal(referenceTemplate.target)
    expect(resultTemplate.nonce).to.deep.equal(referenceTemplate.nonce)
    if (referenceTemplate['default_witness_commitment']) {
      expect(resultTemplate['default_witness_commitment']).to.equal(referenceTemplate['default_witness_commitment'])
    }
  }

  let test$ = function (block$, result, done) {
    TemplateToBlock$(block$, Object.assign(config, {version: config.block_version}))
      .last()
      .onValue((startumTemplate) => {
        expect(startumTemplate.template.getMerkleRoot()).to.deep.equal(result.merkleroot)
        expect(startumTemplate.newHeight).to.deep.equal(result.newHeight)
        testTemplate(startumTemplate.template.attributes, result)
        done()
      })
  }

  it('should create a stratum block from getBlockTemplate for single address', function (done) {
    blockTemplates.forEach(function (blockTemplate) {
      let template = templateToBlock(_.assign(blockTemplate.request, {id: uuid.v4()}))
      let result = blockTemplate.result
      expect(template.getMerkleRoot()).to.deep.equal(result.merkleroot)
      testTemplate(template.attributes, result)
    })
    done()
  })

  it('should create a stratum block from getBlockTemplate for multiSig address', function (done) {
    let config = {
      coinbase_message: '/ConnectBTC - Home for Miners/',
      deposit_address: '3MnhAAGr1uwBioDtqikxXkXGA9QuXgoi3m',
      block_version: '4'
    }
    let templateToBlock = TemplateToBlock(config)
    const blockTemplates = jsonfile.readFileSync(path.join(__dirname, '/blockTemplatesMasterMultiSig.json'))
    blockTemplates.forEach(function (blockTemplate) {
      blockTemplate.request.transactions.forEach(tx => {
        if (!tx.txid) tx.txid = tx.hash
      })
      let template = templateToBlock(_.assign(blockTemplate.request, {id: uuid.v4()}))
      let result = blockTemplate.result
      expect(template.getMerkleRoot()).to.deep.equal(result.merkleroot)
      testTemplate(template.attributes, result)
    })
    done()
  })

  it('should create a stratum block from a single template $', function (done) {
    let block$ = getBlock$([blockTemplates[0]])
    let result = blockTemplates[0].result
    test$(block$, result, done)
  })

  it('should create a stratum block from a $ of ascending blocks', function (done) {
    let block$ = getBlock$([blockTemplates[0], blockTemplates[1], blockTemplates[2], blockTemplates[3]])
    let result = blockTemplates[3].result
    test$(block$, result, done)
  })

  it('should not create a stratum block when new block height is lower', function (done) {
    let block$ = getBlock$([blockTemplates[1], blockTemplates[0]])
    let result = blockTemplates[1].result
    test$(block$, result, done)
  })

  it('should create a stratum block once the block height goes back up', function (done) {
    let block$ = getBlock$([blockTemplates[1], blockTemplates[0], blockTemplates[2]])
    let result = blockTemplates[2].result
    test$(block$, result, done)
  })

  it('should create a stratum block with new height', function (done) {
    let block$ = getBlock$([blockTemplates[0], blockTemplates[1], blockTemplates[2]])
    let result = blockTemplates[2].result
    test$(block$, result, done)
  })

  it('should create a stratum block that is not a new height when height dosn\'t change', function (done) {
    let block$ = getBlock$([blockTemplates[1], blockTemplates[1], blockTemplates[1]])
    let result = blockTemplates[1].result
    result.newHeight = false
    test$(block$, result, done)
  })

  it('should create a stratum block that is not a new height after going up and down', function (done) {
    let block$ = getBlock$([blockTemplates[1], blockTemplates[2], blockTemplates[1], blockTemplates[2]])
    let result = blockTemplates[2].result
    result.newHeight = false
    test$(block$, result, done)
  })
})

describe('Converting Bitcoin block to worker template', function () {
  const blockTemplates = jsonfile.readFileSync(path.join(__dirname, '/blockTemplatesMaster.json'))

  let test$ = function (block$, expected, done) {
    let i = 0
    blocksToWorkerTemplate$(block$)
      .onValue(function (value) {
        expect(value.method).to.deep.equal(expected[i])
        i++
      })
      .onEnd(function () {
        done()
      })
  }

  it('should return a reset method for single block', function (done) {
    let expected = ['reset']
    let block$ = getBlock$([blockTemplates[0]])
    test$(block$, expected, done)
  })

  it('should return a reset method for ascending blocks', function (done) {
    let expected = ['reset', 'reset', 'reset', 'reset']
    let block$ = getBlock$([blockTemplates[0], blockTemplates[1], blockTemplates[2], blockTemplates[3]])
    test$(block$, expected, done)
  })

  it('should add blocks without reset when repeating blocks', function (done) {
    let expected = ['reset', 'add', 'add', 'add']
    let block$ = getBlock$([blockTemplates[0], blockTemplates[0], blockTemplates[0], blockTemplates[0]])
    test$(block$, expected, done)
  })

  it('should return a reset/add depending if repeating or not', function (done) {
    let expected = ['reset', 'add', 'reset', 'add', 'add', 'reset']
    let block$ = getBlock$([blockTemplates[0], blockTemplates[0], blockTemplates[1], blockTemplates[1], blockTemplates[1], blockTemplates[2]])
    test$(block$, expected, done)
  })
})

describe('Converting Template to Stratum Protocol', function () {
  const stratumSubmissionsResults = jsonfile.readFileSync(path.join(__dirname, '/stratumSubmissionsResults.json'))
  const blockTemplates = jsonfile.readFileSync(path.join(__dirname, '/blockTemplatesMaster.json'))

  let test$ = function (blockTemplates, expectedArray, done) {
    let block$ = getBlock$(blockTemplates, 50)
    let template$ = blocksToWorkerTemplate$(block$)
      .map((workerTemplate) => {
        let {template, method} = workerTemplate
        method === 'reset' && (template = template[0])
        let block = new Block(template)
        block.blockHeaderToHexString(block.getMerkleRoot())
        let job = new Job({template: block, difficulty: 65000})
        return {model: job, type: method}
      })
    let count = 0
    reportJob$(template$)
      .onValue(function (response) {
        let expected = expectedArray[count]
        count++
        expect(response.id).to.be.null // eslint-disable-line
        expect(response.method).to.deep.equal(expected.method)
        response.method === 'mining.notify' && response.params.shift()
        expect(response.params).to.deep.equal(expected.params)
      })
      .onError(err => done(err))
      .onEnd(function (response) {
        done()
      })
  }

  it('should create jobs from single block', function (done) {
    test$([blockTemplates[0]], stratumSubmissionsResults[0], done)
  })

  it('should create jobs from all blocks', function (done) {
    test$(blockTemplates, stratumSubmissionsResults[1], done)
  })
})

describe('Setting new difficulty', function () {
  const difficultyMock = jsonfile.readFileSync(path.join(__dirname, '/difficultyMocks.json'))

  difficultyMock.forEach(function ({submissions, target, response}, index) {
    it('Should produce correct difficulty for scenario ' + index, function (done) {
      let now = new Date()
      now = now.getTime()
      let session = new Session({})
      session.get('worker').add({id: '007', name: 'wolfgang', user: new UserModel({name: 'wolf001'})})
      session.set('miningCoin', COIN_TYPE)
      let submissionCollection = submissions.map((submission) => {
        now = now + submission[0]
        return new Submission({
          create: new Date(now),
          'valid': true,
          worker: '12123',
          job: new Job({difficulty: submission[1]})
        })
      })
      let templateCollection = new BlockCollection([], {coinType: COIN_TYPE})
      templateCollection.add({target})
      let submission$ = kefir.sequentially(0, submissionCollection)
      const templateCollections = [templateCollection]
      GetDifficulty$({session, submissionStream: submission$, templateCollections, miningCoinService})
        .onValue(function (diff) {
          expect(diff).to.equal(response)
          done()
        })

      setTimeout(() => {
        templateCollection.add({target})
        templateCollection.add({target})
        templateCollection.add({target})
        templateCollection.add({target})
      }, 100)
    })
  })
})

xdescribe('Create block submission from templates', function () {
  const blockTemplates = jsonfile.readFileSync(path.join(__dirname, '/blockTemplatesMaster.json'))
  let templatesCollection = new BlockCollection()

  before(function (done) {
    blockTemplates.forEach(function (blockTemplate) {
      templatesCollection.add(templateToBlock(_.assign(blockTemplate.request, {id: uuid.v4()})))
    })
    done()
  })

  // TODO: add content to test

  // it('should return a valid block for submission', function (done) {
  //   done()
  // })
})
