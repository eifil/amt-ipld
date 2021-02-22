import test from 'ava'
import { MemCborStore } from '@eifil/ipld-cbor'
import { Root as AMT } from '../root.js'
import { assertDelete, assertGet, assertSet, assertSize } from '../__helpers__/asserts.js'
import { randInt, shuffle } from '../__helpers__/random.js'

test('insert a bunch', async t => {
  const bs = new MemCborStore()
  const a = new AMT<string>(bs)

  const num = 5000n

  for (let i = 0n; i < num; i++) {
    await assertSet(t, a, i, 'foo foo bar')
  }

  for (let i = 0n; i < num; i++) {
    await assertGet(t, a, i, 'foo foo bar')
  }

  const c = await a.flush()
  const na = await AMT.load(bs, c)

  for (let i = 0n; i < num; i++) {
    await assertGet(t, na, i, 'foo foo bar')
  }

  await assertSize(t, na, num)
})

test('insert a bunch with delete', async t => {
  const bs = new MemCborStore()
  const a = new AMT<string>(bs)

  const num = 12000
  const originSet = new Set<number>()
  const removeSet = new Set<number>()

  for (let i = 0; i < num; i++) {
    originSet.add(randInt(0, num))
  }

  for (let i = 0; i < 660; i++) {
    const k = randInt(0, num)
    if (originSet.has(k)) {
      removeSet.add(k)
    }
  }

  for (let i = 0; i < num; i++) {
    if (originSet.has(i)) {
      await assertSet(t, a, BigInt(i), 'foo foo bar')
    }
  }

  for (let i = 0; i < num; i++) {
    if (originSet.has(i)) {
      await assertGet(t, a, BigInt(i), 'foo foo bar')
    }
  }

  let c = await a.flush()
  const na = await AMT.load(bs, c)

  for (let i = 0; i < num; i++) {
    if (removeSet.has(i)) {
      await assertDelete(t, na, BigInt(i))
    }
  }

  c = await na.flush()
  const n2a = await AMT.load(bs, c)

  t.is(
    n2a.size,
    BigInt(originSet.size - removeSet.size),
    `originSN: ${originSet.size}, removeSN: ${removeSet.size}; expected: ${originSet.size - removeSet.size}, actual len(n2a): ${n2a.size}`
  )

  for (let i = 0; i < num; i++) {
    if (originSet.has(i) && !removeSet.has(i)) {
      await assertGet(t, n2a, BigInt(i), 'foo foo bar')
    }
  }
})

test('set order independent', async t => {
  const bs = new MemCborStore()
  const a = new AMT<string>(bs)

  const nKeys = 8 * 8 * 8 * 8

  for (let i = 0; i < nKeys; i++) {
    await assertSet(t, a, BigInt(i), 'foo')
  }

  const c = await a.flush()
  const vals = Array.from(Array(100), () => randInt(0, nKeys))
  const res = new Set<string>()

  for (let i = 0; i < 20; i++) {
    const a = await AMT.load(bs, c)
    shuffle(vals)

    for (const k of vals) {
      await assertSet(t, a, BigInt(k), 'foo2')
    }

    const rc = await a.flush()
    res.add(rc.toString())
  }

  t.is(res.size, 1)
})
