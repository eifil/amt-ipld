import test from 'ava'
import { nodesForHeight } from '../util.js'

test('nodesForHeight', t => {
  t.is(nodesForHeight(1, 0n), 1n)
  t.is(nodesForHeight(2, 1n), 4n)
  t.is(nodesForHeight(3, 2n), 64n)
  t.is(nodesForHeight(4, 3n), 4096n)
})
