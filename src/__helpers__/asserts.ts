import { Assertions } from 'ava'
import { Root } from '../root.js'

export async function assertDelete (t: Assertions, r: Root, i: bigint) {
  const found = await r.delete(i)
  t.true(found)
  const val = await r.get(i)
  t.is(val, undefined)
}

export async function assertSet (t: Assertions, r: Root, i: bigint, val: string) {
  await t.notThrowsAsync(() => r.set(i, val))
}

export function assertSize (t: Assertions, r: Root, expectedSize: bigint) {
  t.is(r.size, expectedSize)
}

export async function assertGet (t: Assertions, r: Root, i: bigint, expectedVal: string) {
  const val = await r.get(i)
  t.is(val, expectedVal)
}

export async function assertEquals (t: Assertions, a: Root, expected: any[]) {
  // Note: the AMT is not necessarily indexed from zero, so indexes may not align.
  let expIndex = 0
  for await (const [amtIdx, val] of a.entries()) {
    t.is(val, expected[expIndex], `AMT index ${amtIdx}, expectation index ${expIndex}`)
    expIndex++
  }
  assertSize(t, a, BigInt(expected.length))
}
