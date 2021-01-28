import test from 'ava'
import { Root as AMT, DEFAULT_BIT_WIDTH, MAX_INDEX } from '../root.js'
import { memstore } from '../__helpers__/memstore.js'
import { assertSet, assertGet, assertSize, assertDelete } from '../__helpers__/asserts.js'
import { randInt } from '../__helpers__/random.js'

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

test('insert a bunch', async t => {
  const bs = memstore()
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

test('entries without flush', async t => {
  const bs = memstore()

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

    for await (const [i] of amt) {
      set1.delete(i)
    }
    t.is(set1.size, 0)

    // ensure it still works after flush
    await amt.flush()

    for await (const [i] of amt) {
      set2.delete(i)
    }
    t.is(set2.size, 0)
  }
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

test('insert a bunch with delete', async t => {
  const bs = memstore()
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

test('entries', async t => {
  const bs = memstore()
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
  for await (const [i] of na) {
    t.is(i, BigInt(indexes[x]), 'got wrong index')
    x++
  }
  t.is(x, indexes.length, 'didnt see enough values')
})
