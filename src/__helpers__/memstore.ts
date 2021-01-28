import { CID } from 'multiformats'
import { sha256 } from 'multiformats/hashes/sha2'
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
      const hash = await sha256.digest(d) // TODO: use blake2b-256
      const k = CID.create(1, dagcbor.code, hash)
      map.set(k.toString(), d)
      return k
    }
  }
}
