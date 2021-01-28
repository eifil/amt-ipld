# amt-ipld

![CI](https://github.com/eifil/amt-ipld/workflows/CI/badge.svg)
[![codecov](https://codecov.io/gh/eifil/amt-ipld/branch/main/graph/badge.svg?token=EMiZKVTIlx)](https://codecov.io/gh/eifil/amt-ipld)
[![dependencies Status](https://status.david-dm.org/gh/eifil/amt-ipld.svg)](https://david-dm.org/eifil/amt-ipld)

Array Mapped Trie (Persistent Vector) implementation using IPLD.

Aims to be conformant with [github.com/filecoin-project/go-amt-ipld](https://github.com/filecoin-project/go-amt-ipld).

## Install

```sh
npm install @eifil/amt-ipld
```

## Usage

The AMT requires a `store` that complies with the following interface:

```ts
import { CID } from 'multiformats'

interface IpldStore {
  get<V = any> (c: CID): Promise<V | undefined>
  put (v: any): Promise<CID>
}
```

### Create a new empty AMT

```ts
import { Root as AMT } from `@eifil/amt-ipld`
const amt = new AMT(store, { bitWidth: 8 })
```

### Load an existing AMT

```ts
import { Root as AMT } from `@eifil/amt-ipld`
const amt = await AMT.load(store, rootCID, { bitWidth: 8 })
```

### Set and get values

```ts
import { Root as AMT } from '@eifil/amt-ipld'

type Fruit = { name: string }

const fruits = new AMT<Fruit>(store, { bitWidth: 8 })

await fruits.set(0n, { name: 'apple' })
await fruits.set(1n, { name: 'orange' })
await fruits.set(3n, { name: 'pear' })

console.log(fruits.size) // 3n

const f0 = await fruits.get(0n)
const f1 = await fruits.get(1n)
const f2 = await fruits.get(2n)
const f3 = await fruits.get(3n)

console.log({ f0, f1, f2, f3 })
// {
//   f0: { name: 'apple' },
//   f1: { name: 'orange' },
//   f2: undefined,
//   f3: { name: 'pear' }
// }

for await (const [index, value] of fruits.entries()) {
  console.log({ index, value })
}
// { index: 0n, value: { name: 'apple' } }
// { index: 1n, value: { name: 'orange' } }
// { index: 3n, value: { name: 'pear' } }

// now flush unsaved data to the store and return the new root CID
const rootCID = await fruits.flush()
console.log(rootCID)
// CID(bafyreigvhzij2lv5oex4rbfo4obm63re6x4ndlzoctfmisollrzw2lhvlm)
```

## Contribute

Feel free to dive in! [Open an issue](https://github.com/eifil/amt-ipld/issues/new) or submit PRs.

## License

This project is dual-licensed under Apache 2.0 and MIT terms:

- Apache License, Version 2.0, ([LICENSE-APACHE](https://github.com/eifil/amt-ipld/blob/main/LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
- MIT license ([LICENSE-MIT](https://github.com/eifil/amt-ipld/blob/main/LICENSE-MIT) or http://opensource.org/licenses/MIT)
