import { CID } from 'multiformats'
import { CborDecoder, IpldStore } from '@eifil/ipld-cbor'
import { Node } from './node.js'
import * as internal from './internal.js'

export class Link<V> {
  cid?: CID
  cached?: Node<V>
  dirty: boolean

  constructor (cid?: CID, cached?: Node<V>, dirty: boolean = false) {
    this.cid = cid
    this.cached = cached
    this.dirty = dirty
  }

  async load (bs: IpldStore, bitWidth: number, height: bigint, decoder?: CborDecoder<V>): Promise<Node<V>> {
    if (!this.cached) {
      const { cid } = this
      if (!cid) {
        throw new Error('missing node CID')
      }
      const nd = await bs.get(cid, internal.Node)
      if (nd == null) {
        throw new Error('missing node')
      }
      this.cached = Node.fromInternal<V>(nd, bitWidth, false, height === 0n, decoder)
    }
    return this.cached
  }
}
