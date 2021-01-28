import { Assertions } from 'ava'
import { Root } from '../root.js'

export async function assertDelete (t: Assertions, r: Root<string>, i: bigint) {
  const found = await r.delete(i)
  t.true(found)
  const val = await r.get(i)
  t.is(val, undefined)
}

export async function assertSet (t: Assertions, r: Root<string>, i: bigint, val: string) {
  await t.notThrowsAsync(() => r.set(i, val))
}

export function assertSize (t: Assertions, r: Root<string>, expectedSize: bigint) {
  t.is(r.size, expectedSize)
}

export async function assertGet (t: Assertions, r: Root<string>, i: bigint, expectedVal: string) {
  const val = await r.get(i)
  t.is(val, expectedVal)
}
