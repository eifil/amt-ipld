import test from 'ava'
import { MemCborStore } from '@eifil/ipld-cbor'
import { Root as AMT } from '../root.js'

test('invalid height empty', async t => {
  const bs = new MemCborStore()
  const a = new AMT<string>(bs)
  Object.assign(a, { height: 1n })
  const c = await a.flush()
  await t.throwsAsync(() => AMT.load(bs, c))
})

test('invalid height single', async t => {
  const bs = new MemCborStore()
  const a = new AMT<string>(bs)
  await a.set(0n, '')
  Object.assign(a, { height: 1n })
  const c = await a.flush()
  await t.throwsAsync(() => AMT.load(bs, c))
})

test('invalid height tall', async t => {
  const bs = new MemCborStore()
  const a = new AMT<string>(bs)
  await a.set(15n, '')

  Object.assign(a, { height: 2n })
  const c = await a.flush()

  const after = await AMT.load(bs, c)
  const out = await after.get(31n)
  t.is(out, undefined)
})
