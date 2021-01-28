import { CID } from 'multiformats'
// @ts-ignore
import { blake2b256 } from '@multiformats/blake2/blake2b'
import * as dagcbor from '@ipld/dag-cbor'

export function memstore () {
  const map = new Map<string, Uint8Array>()
  return {
    get (k: CID) {
      const d = map.get(k.toString())
      return d ? dagcbor.decode(d) : d
    },
    async put (v: any) {
      const d = dagcbor.encode(v)
      const hash = await blake2b256.digest(d)
      const k = CID.create(1, dagcbor.code, hash)
      map.set(k.toString(), d)
      return k
    }
  }
}
