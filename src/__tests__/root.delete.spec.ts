import test from 'ava'
import { Root as AMT } from '../root.js'
import { assertDelete, assertGet, assertSet, assertSize } from '../__helpers__/asserts.js'
import { memstore } from '../__helpers__/memstore.js'
import { randInt, shuffle } from '../__helpers__/random.js'

test('delete first entry', async t => {
  const bs = memstore()
  const a = new AMT<string>(bs)

  await assertSet(t, a, 0n, 'cat')
  await assertSet(t, a, 27n, 'cat')

  await assertDelete(t, a, 27n)

  const c = await a.flush()
  const na = await AMT.load(bs, c)

  assertSize(t, na, 1n)
})

test('delete', async t => {
  const bs = memstore()
  const a = new AMT<string>(bs)

  // Check that deleting out of range of the current AMT returns not found
  const found = await a.delete(200n)
  t.false(found)

  await assertSet(t, a, 0n, 'cat')
  await assertSet(t, a, 1n, 'cat')
  await assertSet(t, a, 2n, 'cat')
  await assertSet(t, a, 3n, 'cat')

  await assertDelete(t, a, 1n)

  await assertGet(t, a, 0n, 'cat')
  await assertGet(t, a, 2n, 'cat')
  await assertGet(t, a, 3n, 'cat')

  await assertDelete(t, a, 0n)
  await assertDelete(t, a, 2n)
  await assertDelete(t, a, 3n)

  assertSize(t, a, 0n)

  await assertSet(t, a, 23n, 'dog')
  await assertSet(t, a, 24n, 'dog')

  await assertDelete(t, a, 23n)

  assertSize(t, a, 1n)

  const c = await a.flush()
  const na = await AMT.load(bs, c)

  assertSize(t, na, 1n)

  const a2 = new AMT(bs)
  await assertSet(t, a2, 24n, 'dog')

  const a2c = await a2.flush()

  t.true(c.equals(a2c))
})

test('delete reduce height', async t => {
  const bs = memstore()
  const a = new AMT<string>(bs)

  await assertSet(t, a, 1n, 'thing')

  const c1 = await a.flush()

  await assertSet(t, a, 37n, 'other')

  const c2 = await a.flush()
  const a2 = await AMT.load(bs, c2)

  await assertDelete(t, a2, 37n)
  assertSize(t, a2, 1n)

  const c3 = await a2.flush()
  t.true(c1.equals(c3), 'structures did not match after insert/delete')
})

test('delete order independent', async t => {
  const bs = memstore()
  const a = new AMT<string>(bs)

  const nKeys = 8 * 8 * 8 * 8

  for (let i = 0; i < nKeys; i++) {
    await assertSet(t, a, BigInt(i), 'foo')
  }

  const c = await a.flush()
  const mvals = new Set<number>()

  for (let i = 0; i < 100; i++) {
    mvals.add(randInt(0, nKeys))
  }

  const vals = Array.from(mvals.values())
  const res = new Set<string>()

  for (let i = 0; i < 20; i++) {
    const a = await AMT.load(bs, c)
    shuffle(vals)

    for (const k of vals) {
      await assertDelete(t, a, BigInt(k))
    }

    const rc = await a.flush()
    res.add(rc.toString())
  }

  t.is(res.size, 1)
})
