import test from 'ava'
import { MemCborStore } from '@eifil/ipld-cbor'
import { Root as AMT } from '../root.js'
import { assertGet, assertSize } from '../__helpers__/asserts.js'
import { randInt } from '../__helpers__/random.js'

test('entries', async t => {
  const bs = new MemCborStore()
  const a = new AMT<string>(bs)

  const indexes = []
  for (let i = 0; i < 10000; i++) {
    if (randInt(0, 2) === 0) {
      indexes.push(i)
    }
  }

  for (const i of indexes) {
    await a.set(BigInt(i), 'value')
  }

  for (const i of indexes) {
    await assertGet(t, a, BigInt(i), 'value')
  }

  assertSize(t, a, BigInt(indexes.length))

  const c = await a.flush()
  const na = await AMT.load(bs, c)

  assertSize(t, na, BigInt(indexes.length))

  let x = 0
  for await (const i of na.keys()) {
    t.is(i, BigInt(indexes[x]), 'got wrong index')
    x++
  }
  t.is(x, indexes.length, 'didnt see enough values')
})

test('entries without flush', async t => {
  const bs = new MemCborStore()

  for (const indexes of [
    [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n],
    [8n],
    [8n, 9n, 64n],
    [64n, 8n, 9n]
  ]) {
    const amt = new AMT<string>(bs)
    const set1 = new Set<bigint>()
    const set2 = new Set<bigint>()

    for (const index of indexes) {
      await amt.set(index, '')
      set1.add(index)
      set2.add(index)
    }
    t.is(BigInt(set1.size), amt.size)

    for await (const i of amt.keys()) {
      set1.delete(i)
    }
    t.is(set1.size, 0)

    // ensure it still works after flush
    await amt.flush()

    for await (const i of amt.keys()) {
      set2.delete(i)
    }
    t.is(set2.size, 0)
  }
})
