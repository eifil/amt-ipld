import test from 'ava'
import { Root as AMT, DEFAULT_BIT_WIDTH } from '../root.js'
import { memstore } from '../__helpers__/memstore.js'

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

// test('explicit bitwidth', async t => {
//   a, err := NewAMT(bs, UseTreeBitWidth(4))
//   require.NoError(t, err)
//   assert.Equal(t, uint(4), a.bitWidth)

//   c, err := FromArray(ctx, bs, numbers, UseTreeBitWidth(4))
//   require.NoError(t, err)
//   if defaultBitWidth != uint(4) {
//     _, err = LoadAMT(ctx, bs, c) // Fails to load with implicit default bitwidth
//     assert.Error(t, err)
//   }
//   as, err := LoadAMT(ctx, bs, c, UseTreeBitWidth(4))
//   require.NoError(t, err)
//   assert.Equal(t, uint(4), as.bitWidth)
// })
