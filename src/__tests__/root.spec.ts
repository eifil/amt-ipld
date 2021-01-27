import test from 'ava'
import { Root as AMT, DEFAULT_BIT_WIDTH } from '../root.js'
import { memstore } from '../__helpers__/memstore.js'
import { assertSet, assertGet, assertSize } from '../__helpers__/asserts.js'

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
