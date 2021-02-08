import { CID } from 'multiformats'
import { Node } from './node.js'
import { CBORDecoder, IpldStore } from './types.js'
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

  async load (bs: IpldStore, bitWidth: number, height: bigint, decoder?: CBORDecoder<V>): Promise<Node<V>> {
    if (!this.cached) {
      const { cid } = this
      if (!cid) {
        throw new Error('missing node CID')
      }
      const nd = internal.Node.decodeCBOR(await bs.get(cid))
      this.cached = Node.fromInternal<V>(nd, bitWidth, false, height === 0n, decoder)
    }
    return this.cached
  }
}
