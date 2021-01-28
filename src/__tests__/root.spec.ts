import test from 'ava'
import { Root as AMT, DEFAULT_BIT_WIDTH, MAX_INDEX } from '../root.js'
import * as internal from '../internal.js'
import { memstore } from '../__helpers__/memstore.js'
import { assertSet, assertGet, assertSize, assertDelete } from '../__helpers__/asserts.js'
import { randInt } from '../__helpers__/random.js'

const bitWidth = DEFAULT_BIT_WIDTH

test('basic set and get', async t => {
  const bs = memstore()
  const a = new AMT<string>(bs)

  await assertSet(t, a, 2n, 'foo')
  await assertGet(t, a, 2n, 'foo')
  assertSize(t, a, 1n)

  const c = await a.flush()
  const clean = await AMT.load(bs, c)

  await assertGet(t, clean, 2n, 'foo')
  assertSize(t, clean, 1n)
})

test('round trip', async t => {
  const bs = memstore()
  const a = new AMT<string>(bs)
  const emptyCid = await a.flush()

  const k = 100000n
  await assertSet(t, a, k, 'foo')
  await assertDelete(t, a, k)

  const c = await a.flush()
  t.true(c.equals(emptyCid))
})

test('max range', async t => {
  const bs = memstore()
  const a = new AMT<string>(bs)

  await t.notThrowsAsync(() => a.set(MAX_INDEX, 'what is up 1'))
  const err = await t.throwsAsync(() => a.set(MAX_INDEX + 1n, 'what is up 2'))

  t.is(err.message, `index ${MAX_INDEX + 1n} is out of range for the amt`)
})

test('max range with bit width 11', async t => {
  const bs = memstore()
  const a = new AMT<string>(bs, { bitWidth: 11 })

  await t.notThrowsAsync(() => a.set(MAX_INDEX, 'what is up 1'))
  const err = await t.throwsAsync(() => a.set(MAX_INDEX + 1n, 'what is up 2'))

  t.is(err.message, `index ${MAX_INDEX + 1n} is out of range for the amt`)
})

test('expand', async t => {
  const bs = memstore()
  const a = new AMT<string>(bs)

  await assertSet(t, a, 2n, 'foo')
  await assertSet(t, a, 11n, 'bar')
  await assertSet(t, a, 79n, 'baz')

  await assertGet(t, a, 2n, 'foo')
  await assertGet(t, a, 11n, 'bar')
  await assertGet(t, a, 79n, 'baz')

  const c = await a.flush()
  const na = await AMT.load(bs, c)

  await assertGet(t, na, 2n, 'foo')
  await assertGet(t, na, 11n, 'bar')
  await assertGet(t, na, 79n, 'baz')
})

test('chaos', async t => {
  const bs = memstore()

  let a = new AMT<string>(bs)
  let c = await a.flush()

  const maxPerOp = 10
  const maxIndex = 20000

  const ops = Array.from(Array(1000), () => ({
    del: randInt(0, 10) < 4,
    idxs: Array.from(Array(randInt(0, maxPerOp)), () => randInt(0, maxIndex))
  }))

  const testIndexes = new Set<bigint>()

  for (const [i, o] of ops.entries()) {
    a = await AMT.load(bs, c)

    for (const idx of o.idxs) {
      const index = BigInt(idx)
      if (!o.del) {
        await a.set(index, 'test')
        testIndexes.add(index)
      } else {
        await a.delete(index)
        testIndexes.delete(index)
      }
    }

    const correctSize = BigInt(testIndexes.size)
    t.is(a.size, correctSize, `bad size before flush, correct: ${correctSize}, size: ${a.size}, i: ${i}`)

    c = await a.flush()
    a = await AMT.load(bs, c)

    t.is(a.size, correctSize, `bad size after flush, correct: ${correctSize}, size: ${a.size}, i: ${i}`)

    let itCount = 0n
    for await (const _ of a) { // eslint-disable-line no-unused-vars
      itCount++
    }

    t.is(itCount, correctSize, `bad counted size after flush, correct: ${correctSize}, count: ${itCount}, i: ${i}`)
  }
})

test('first set index', async t => {
  const bs = memstore()

  const vals = [0, 1, 5, 1 << bitWidth, 1 << bitWidth + 1, 276, 1234, 62881923]
  for (const [, v] of vals.entries()) {
    const a = new AMT<string>(bs)
    await a.set(BigInt(v), `${v}`)

    let fsi = await a.firstSetIndex()
    t.is(fsi, BigInt(v), 'got wrong index out')

    const rc = await a.flush()
    const after = await AMT.load(bs, rc)

    fsi = await after.firstSetIndex()
    t.is(fsi, BigInt(v), 'got wrong index out after serialization')

    const found = await after.delete(BigInt(v))
    t.true(found)

    await t.throwsAsync(() => after.firstSetIndex())
  }
})

test('empty CID stability', async t => {
  const bs = memstore()
  const a = new AMT<string>(bs)

  const c1 = await a.flush()

  // iterating array should not affect its cid
  for await (const _ of a) { // eslint-disable-line no-unused-vars
    // noop
  }

  const c2 = await a.flush()
  t.true(c1.equals(c2))

  // adding and removing and item should not affect its cid
  await a.set(0n, '')
  await a.delete(0n)

  const c3 = await a.flush()
  t.true(c1.equals(c3))
})

test('bad bitfield', async t => {
  const bs = memstore()
  const subnode = await bs.put(new internal.Node(new Uint8Array()).encodeCBOR())

  const root = new internal.Root(bitWidth, 10n, 10n, new internal.Node(new Uint8Array([255])))
  root.node.links.push(subnode)
  const c = await bs.put(root.encodeCBOR())

  await t.throwsAsync(() => AMT.load(bs, c))
})
