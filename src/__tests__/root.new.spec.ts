import test from 'ava'
import { MemCborStore } from '@eifil/ipld-cbor'
import { DEFAULT_BIT_WIDTH, Root as AMT } from '../root.js'
import { assertEquals, assertSize } from '../__helpers__/asserts.js'

const bitWidth = DEFAULT_BIT_WIDTH
const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

test('from array', async t => {
  const bs = new MemCborStore()
  const c = await AMT.fromArray(bs, numbers)
  const a = await AMT.load(bs, c)
  await assertEquals(t, a, numbers)
  assertSize(t, a, BigInt(numbers.length))
})

test('default config', async t => {
  const bs = new MemCborStore()
  const a = new AMT(bs)
  t.is(a.bitWidth, bitWidth)

  const c = await AMT.fromArray(bs, numbers)
  const as = await AMT.load(bs, c)
  t.is(as.bitWidth, bitWidth)
})

test('explicit bitwidth', async t => {
  const bs = new MemCborStore()
  const a = new AMT(bs, { bitWidth: 4 })
  t.is(a.bitWidth, 4)

  const c = await AMT.fromArray(bs, numbers, { bitWidth: 4 })
  await t.throwsAsync(() => AMT.load(bs, c))
})
