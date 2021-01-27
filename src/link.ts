import { CID } from 'multiformats'
import { Node } from './node.js'
import { IpldStore } from './types.js'
import * as internal from './internal.js'

export class Link<T = any> {
  cid?: CID
  cached?: Node<T>
  dirty: boolean

  constructor (cid?: CID, cached?: Node, dirty: boolean = false) {
    this.cid = cid
    this.cached = cached
    this.dirty = dirty
  }

  async load (bs: IpldStore, bitWidth: number, height: bigint): Promise<Node<T>> {
    if (!this.cached) {
      const { cid } = this
      if (!cid) {
        throw new Error('missing node CID')
      }
      const nd = internal.Node.decodeCBOR(await bs.get(cid))
      this.cached = Node.fromInternal(nd, bitWidth, false, height === 0n)
    }
    return this.cached
  }
}
