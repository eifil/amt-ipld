import anyTest, { TestInterface } from 'ava'
import { CID } from 'multiformats'
import { Root as AMT } from '../root.js'
import { memstore } from '../__helpers__/memstore.js'
import { assertEquals } from '../__helpers__/asserts.js'
import { IpldStore } from '../types.js'

const test = anyTest as TestInterface<{ bs: IpldStore, a: AMT<number>, c: CID }>
const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

test.before(async t => {
  t.context.bs = memstore()
  t.context.a = new AMT<number>(t.context.bs)
  await t.context.a.batchSet(numbers)
  await assertEquals(t, t.context.a, numbers)
  t.context.c = await t.context.a.flush()
})

test('with strict, error if a key is missing', async t => {
  const clean = await AMT.load(t.context.bs, t.context.c)
  await assertEquals(t, clean, numbers)
  await t.throwsAsync(() => clean.batchDelete([100n], true))
})

test('with strict, delete no keys ok', async t => {
  const clean = await AMT.load(t.context.bs, t.context.c)
  await assertEquals(t, clean, numbers)

  const mod = await clean.batchDelete([], true)
  t.false(mod)
  await assertEquals(t, clean, numbers)
})

test('with strict, delete some but not all keys ok', async t => {
  const clean = await AMT.load(t.context.bs, t.context.c)
  await assertEquals(t, clean, numbers)

  const mod = await clean.batchDelete([0n, 1n, 2n, 3n], true)
  t.true(mod)
  await assertEquals(t, clean, numbers.slice(4))
})

test('with strict, error to delete some keys with one missing', async t => {
  const clean = await AMT.load(t.context.bs, t.context.c)
  await assertEquals(t, clean, numbers)
  await t.throwsAsync(() => clean.batchDelete([0n, 1n, 2n, 3n, 100n], true))
})

test('with strict, delete all keys ok', async t => {
  const clean = await AMT.load(t.context.bs, t.context.c)
  await assertEquals(t, clean, numbers)

  const mod = await clean.batchDelete([0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n], true)
  t.true(mod)
  await assertEquals(t, clean, [])
})

test('without strict, delete only absent keys ok', async t => {
  const clean = await AMT.load(t.context.bs, t.context.c)
  await assertEquals(t, clean, numbers)

  const mod = await clean.batchDelete([100n, 101n], false)
  t.false(mod)
  await assertEquals(t, clean, numbers)
})

test('without strict, delete some keys ok', async t => {
  const clean = await AMT.load(t.context.bs, t.context.c)
  await assertEquals(t, clean, numbers)

  const mod = await clean.batchDelete([0n, 1n, 2n, 3n, 100n, 101n], false)
  t.true(mod)
  await assertEquals(t, clean, numbers.slice(4))
})

test('without strict, delete all keys ok', async t => {
  const clean = await AMT.load(t.context.bs, t.context.c)
  await assertEquals(t, clean, numbers)

  const mod = await clean.batchDelete([0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n], false)
  t.true(mod)
  await assertEquals(t, clean, [])
})
