import test from 'ava'
import { Root as AMT, DEFAULT_BIT_WIDTH, MAX_INDEX } from '../root.js'
import { memstore } from '../__helpers__/memstore.js'
import { assertSet, assertGet, assertSize, assertDelete } from '../__helpers__/asserts.js'

const bitWidth = DEFAULT_BIT_WIDTH
const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

test('default config', async t => {
  const bs = memstore()
  const a = new AMT(bs)
  t.is(a.bitWidth, bitWidth)

  const c = await AMT.fromArray(bs, numbers)
  const as = await AMT.load(bs, c)
  t.is(as.bitWidth, bitWidth)
})

test('explicit bitwidth', async t => {
  const bs = memstore()
  const a = new AMT(bs, { bitWidth: 4 })
  t.is(a.bitWidth, 4)

  const c = await AMT.fromArray(bs, numbers, { bitWidth: 4 })
  await t.throwsAsync(() => AMT.load(bs, c))
})

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
