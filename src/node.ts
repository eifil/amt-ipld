import { EmptyNodeError, LeafExpectedError, LeafUnexpectedError, LinksAndValuesError, NoValuesError, UndefinedCIDError } from './errors.js'
import * as internal from './internal.js'
import { Link } from './link.js'
import { CBORDecoder, IpldStore } from './types.js'
import { nodesForHeight } from './util.js'

/**
 * Codec for IPLD dag-cbor.
 */
const DAG_CBOR = 113

/**
 * the number of bytes required such that there is a single bit for each element
 * in the links or value array. This is (bitWidth^2)/8.
 */
function bmapBytes (bitWidth: number): number {
  if (bitWidth <= 3) return 1
  return 1 << (bitWidth - 3)
}

/**
 * node is described in more detail in its internal serialized form,
 * internal.Node. This form contains a fully expanded form of internal.Node
 * where the Bmap is used to expand the contracted form of either Values (leaf)
 * or Links (non-leaf) for ease of addressing.
 * Both properties may be nil if the node is empty (a root node).
 */
export class Node<V> {
  links: Link<V>[] = []
  values: V[] = []
  private readonly decoder?: CBORDecoder<V>

  constructor (links: Link<V>[] = [], decoder?: CBORDecoder<V>) {
    this.links = links
    this.decoder = decoder
  }

  /**
   * Create a new from a serialized form. This operation takes an internal.Node
   * and returns a node. internal.Node uses bitmap compaction of links or values
   * arrays, while node uses the expanded form. This method performs the expansion
   * such that we can use simple addressing of this node's child elements.
   */
  static fromInternal<V> (nd: internal.Node, bitWidth: number, allowEmpty: boolean, expectLeaf: boolean, decoder?: CBORDecoder<V>): Node<V> {
    if (nd.links.length && nd.values.length) {
      // malformed AMT, a node cannot be both leaf and non-leaf
      throw new LinksAndValuesError()
    }

    // strictly require the bitmap to be the correct size for the given bitWidth
    const expWidth = bmapBytes(bitWidth)
    if (expWidth !== nd.bmap.length) {
      throw new Error(`expected bitfield to be ${expWidth} bytes long, found bitfield with ${nd.bmap.length} bytes`)
    }

    const width = 1 << bitWidth
    let i = 0
    const n = new Node<V>([], decoder)
    if (nd.values.length) { // leaf node, height=0
      if (!expectLeaf) {
        throw new LeafUnexpectedError()
      }
      for (let x = 0; x < width; x++) {
        // check if this value exists in the bitmap, pull it out of the compacted
        // list if it does
        if ((nd.bmap[Math.floor(x / 8)] & (1 << (x % 8))) > 0) {
          if (i >= nd.values.length) {
            // too many bits were set in the bitmap for the number of values
            // available
            throw new Error(`expected at least ${i + 1} values, found ${nd.values.length}`)
          }
          n.values[x] = nd.values[i]
          i++
        }
      }
      if (i !== Object.keys(nd.values).length) {
        // the number of bits set in the bitmap was not the same as the number of
        // values in the array
        throw new Error(`expected ${i} values, got ${Object.keys(nd.values).length}`)
      }
    } else if (nd.links.length) {
      // non-leaf node, height>0
      if (expectLeaf) {
        throw new LeafExpectedError()
      }
      for (let x = 0; x < width; x++) {
        // check if this child link exists in the bitmap, pull it out of the
        // compacted list if it does
        if ((nd.bmap[Math.floor(x / 8)] & (1 << (x % 8))) > 0) {
          if (i >= nd.links.length) {
            // too many bits were set in the bitmap for the number of values
            // available
            throw new Error(`expected at least ${i + 1} links, found ${nd.links.length}`)
          }
          const c = nd.links[i]
          if (c == null) {
            throw new UndefinedCIDError()
          }
          // TODO: check link hash function.
          if (c.code !== DAG_CBOR) {
            throw new Error(`internal amt nodes must be cbor, found ${c.code}`)
          }
          n.links[x] = new Link(c)
          i++
        }
      }
      if (i !== Object.keys(nd.links).length) {
        // the number of bits set in the bitmap was not the same as the number of
        // values in the array
        throw new Error(`expected ${i} links, got ${Object.keys(nd.links).length}`)
      }
    } else if (!allowEmpty) { // only THE empty AMT case can allow this
      throw new EmptyNodeError()
    }
    return n
  }

  // collapse occurs when we only have the single child node. If this is the case
  // we need to reduce height by one. Continue down the tree, reducing height
  // until we're either at a single height=0 node or we have something other than
  // a single child node.
  async collapse (bs: IpldStore, bitWidth: number, height: bigint): Promise<bigint> {
    // No links at all?
    if (!this.links.length) {
      return 0n
    }

    // If we have any links going "to the right", we can't collapse any more.
    for (const l of this.links.slice(1)) {
      if (l != null) return height
    }

    // If we have _no_ links, we've collapsed everything.
    if (this.links[0] == null) {
      return 0n
    }

    // only one child, collapse it.
    const subn = await this.links[0].load(bs, bitWidth, height - 1n, this.decoder)

    // Collapse recursively.
    const newHeight = await subn.collapse(bs, bitWidth, height - 1n)

    this.links = subn.links
    this.values = subn.values

    return newHeight
  }

  /**
   * Does this node contain any child nodes or values?
   */
  empty (): boolean {
    for (const l of this.links) {
      if (l != null) {
        return false
      }
    }
    for (const v of this.values) {
      if (v != null) {
        return false
      }
    }
    return true
  }

  /**
   * Recursive get() called through the tree in order to retrieve values from
   * leaf nodes. We start at the root and navigate until height=0 where the
   * entries themselves should exist. At any point in the navigation we can
   * assert that a value does not exist in this AMT if an expected intermediate
   * doesn't exist, so we don't need to do full height traversal for many cases
   * where we don't have that index.
   */
  async get (bs: IpldStore, bitWidth: number, height: bigint, i: bigint): Promise<V | undefined> {
    // height=0 means we're operating on a leaf node where the entries themselves
    // are stores, we have a `set` so it must exist if the node is correctly
    // formed
    if (height === 0n) {
      const d = this.values[Number(i)]
      if (d == null) return d
      return this.decoder ? this.decoder.decodeCBOR(d) : d
    }

    // Non-leaf case where we need to navigate further down toward the correct
    // leaf by consuming some of the provided index to form the index at this
    // height and passing the remainder down.
    // The calculation performed is to divide the addressible indexes of each
    // child node such that each child has the ability to contain that range of
    // indexes somewhere in its graph. e.g. at height=1 for bitWidth=3, the total
    // addressible index space we can contain is in the range of 0 to
    // `(bitWidth^2) ^ (height+1) = 8^2 = 64`. Where each child node can contain
    // 64/8 of indexes. This is true regardless of the position in the overall
    // AMT and original index from the Get() operation because we modify the index
    // before passing it to lower nodes to remove the bits relevant to higher
    // addressing. e.g. at height=1, a call to any child's get() will receive an
    // index in the range of 0 to bitWidth^2.
    const nfh = nodesForHeight(bitWidth, height)
    const ln = this.links[Number(i / nfh)]
    if (ln == null) {
      // This can occur at any point in the traversal, not just height=0, it just
      // means that the higher up it occurs that a larger range of indexes in this
      // region don't exist.
      return ln
    }

    const subn = await ln.load(bs, bitWidth, height - 1n, this.decoder)

    // `i%nfh` discards index information for this height so the child only gets
    // the part of the index that is relevant for it.
    // e.g. get(50) at height=1 for width=8 would be 50%8=2, i.e. the child will
    // be asked to get(2) and it will have leaf nodes (because it's height=0) so
    // the actual value will be at index=2 of its values array.
    return subn.get(bs, bitWidth, height - 1n, i % nfh)
  }

  /**
   * Recursively handle a delete through the tree, navigating down in the same
   * way as is documented in get().
   */
  async delete (bs: IpldStore, bitWidth: number, height: bigint, i: bigint): Promise<boolean> {
    // at the leaf node where the value is, expand out the values array and
    // zero out the value and bit in the bitmap to indicate its deletion
    if (height === 0n) {
      if (this.values[Number(i)] == null) {
        return false
      }
      delete this.values[Number(i)]
      return true
    }

    // see get() documentation on how nfh and subi describes the index at this
    // height
    const nfh = nodesForHeight(bitWidth, height)
    const subi = Number(i / nfh)

    const ln = this.links[subi]
    if (ln == null) {
      return false
    }

    // we're at a non-leaf node, so navigate down to the appropriate child and
    // continue
    const subn = await ln.load(bs, bitWidth, height - 1n, this.decoder)

    // see get() documentation for how the i%... calculation trims the index down
    // to only that which is applicable for the height below
    const deleted = await subn.delete(bs, bitWidth, height - 1n, i % nfh)
    if (!deleted) {
      return false
    }

    // if the child node we just deleted from now has no children or elements of
    // its own, we need to zero it out in this node. This compaction process may
    // recursively chain back up through the calling nodes, removing more than
    // one node in total for this delete operation (i.e. where an index contains
    // the only entry on a particular branch of the tree).
    if (subn.empty()) {
      delete this.links[subi]
    } else {
      ln.dirty = true
    }

    return true
  }

  // Recursive implementation backing ForEach and ForEachAt. Performs a
  // depth-first walk of the tree, beginning at the 'start' index. The 'offset'
  // argument helps us locate the lateral position of the current node so we can
  // figure out the appropriate 'index', since indexes are not stored with values
  // and can only be determined by knowing how far a leaf node is removed from
  // the left-most leaf node.
  async * entries (bs: IpldStore, bitWidth: number, height: bigint, start: bigint = 0n, offset: bigint = 0n): AsyncGenerator<[bigint, V]> {
    if (height === 0n) {
      // height=0 means we're at leaf nodes and get to use our callback
      for (const [i, v] of this.values.entries()) {
        if (v == null) {
          continue
        }

        const ix = offset + BigInt(i)
        if (ix < start) {
          // if we're here, 'start' is probably somewhere in the
          // middle of this node's elements
          continue
        }

        // use 'offset' to determine the actual index for this element, it
        // tells us how distant we are from the left-most leaf node
        yield [ix, this.decoder ? this.decoder.decodeCBOR(v) : v]
      }
      return
    }

    const subCount = nodesForHeight(bitWidth, height)
    for (const [i, ln] of this.links.entries()) {
      if (ln == null) {
        continue
      }

      // 'offs' tells us the index of the left-most element of the subtree defined
      // by 'sub'
      const offs = offset + (BigInt(i) * subCount)
      const nextOffs = offs + subCount
      if (start >= nextOffs) {
        // if we're here, 'start' lets us skip this entire sub-tree
        continue
      }

      const subn = await ln.load(bs, bitWidth, height - 1n, this.decoder)

      // recurse into the child node, providing 'offs' to tell it where it's
      // located in the tree
      yield * subn.entries(bs, bitWidth, height - 1n, start, offs)
    }
  }

  /**
   * Recursive implementation of FirstSetIndex that's performed on the left-most
   * nodes of the tree down to the leaf. In order to return a correct index, we
   * need to accumulate the appropriate number of spaces to the left of the
   * left-most that exist at each level, taking into account the number of
   * blank leaf-entry positions that exist.
   */
  async firstSetIndex (bs: IpldStore, bitWidth: number, height: bigint): Promise<bigint> {
    if (height === 0n) {
      for (const [i, v] of this.values.entries()) {
        if (v != null) {
          // returning 'i' here is a local index (0<=i<width), which isn't the
          // actual index unless this is a single-node, height=0 AMT.
          return BigInt(i)
        }
      }
      // if we're here, we're either dealing with a malformed AMT or an empty AMT
      throw new NoValuesError()
    }

    // we're dealing with a non-leaf node
    for (const [i, ln] of this.links.entries()) {
      if (ln == null) {
        continue // nothing here.
      }

      const subn = await ln.load(bs, bitWidth, height - 1n, this.decoder)
      const ix = await subn.firstSetIndex(bs, bitWidth, height - 1n)

      // 'ix' is the child's understanding of it's left-most set index, we have
      // to add to it the number of _gaps_ that are present on the left of
      // the child node's position. So if the child node is index (i) 0 then
      // it's the left-most and i*subCount will be 0. But if it's 1, subCount
      // will account for an entire missing branch to the left in position 0.
      // This operation continues as we reverse back through the call stack
      // building up to the correct index.
      const subCount = nodesForHeight(bitWidth, height)
      return ix + (BigInt(i) * subCount)
    }

    throw new NoValuesError()
  }

  /**
   * Recursive implementation of the set operation that calls through child nodes
   * down into the appropriate leaf node for the given index. The index 'i' is
   * relative to this current node, so must be adjusted as we recurse down
   * through the tree. The same operation is used for get, see the documentation
   * there for how the index is calculated for each height and adjusted as we
   * move down.
   * Returns a bool that indicates whether a new value was added or an existing
   * one was overwritten. This is useful for adjusting the Count in the root node
   * when we reverse back out of the calls.
   */
  async set (bs: IpldStore, bitWidth: number, height: bigint, i: bigint, val: V): Promise<boolean> {
    if (height === 0n) {
      // we're at the leaf, we can either overwrite the value that already exists
      // or set a new one if there is none
      const alreadySet = this.values[Number(i)] != null
      const maybeEncoder = val as any
      this.values[Number(i)] = maybeEncoder.encodeCBOR ? maybeEncoder.encodeCBOR() : val
      return !alreadySet
    }

    // see get() documentation on how nfh and subi describes the index at this
    // height
    const nfh = nodesForHeight(bitWidth, height)

    // Load but don't mark dirty or actually link in any _new_ intermediate
    // nodes. We'll do that on return if nothing goes wrong.
    let ln = this.links[Number(i / nfh)]
    if (ln == null) {
      ln = new Link(undefined, new Node<V>([], this.decoder))
    }
    const subn = await ln.load(bs, bitWidth, height - 1n, this.decoder)

    // see get() documentation for how the i%... calculation trims the index down
    // to only that which is applicable for the height below
    const nodeAdded = await subn.set(bs, bitWidth, height - 1n, i % nfh, val)

    // Make all modifications on the way back up if there was no error.
    ln.dirty = true // only mark dirty on success.
    this.links[Number(i / nfh)] = ln

    return nodeAdded
  }

  /**
   * flush is the per-node form of Flush() that operates on each node, and calls
   * flush() on each child node. It generates the serialized form of this node,
   * which includes the bitmap and compacted links or values array.
   */
  async flush (bs: IpldStore, bitWidth: number, height: bigint): Promise<internal.Node> {
    const nd = new internal.Node(new Uint8Array(bmapBytes(bitWidth)))

    if (height === 0n) {
      // leaf node, we're storing values in this node
      for (const [i, val] of this.values.entries()) {
        if (val == null) {
          continue
        }
        nd.values.push(val)
        const byteIndex = Math.floor(i / 8)
        nd.bmap[byteIndex] = nd.bmap[byteIndex] | 1 << (i % 8)
      }
      return nd
    }

    // non-leaf node, we're only storing Links in this node
    for (const [i, ln] of this.links.entries()) {
      if (ln == null) {
        continue
      }
      if (ln.dirty) {
        if (ln.cached == null) {
          throw new Error('expected dirty node to be cached')
        }
        const subn = await ln.cached.flush(bs, bitWidth, height - 1n)
        const c = await bs.put(subn.encodeCBOR())

        ln.cid = c
        ln.dirty = false
      }
      if (!ln.cid) {
        throw new Error('expected clean node to have CID')
      }
      nd.links.push(ln.cid)
      // set the bit in the bitmap for this position to indicate its presence
      const byteIndex = Math.floor(i / 8)
      nd.bmap[byteIndex] = nd.bmap[byteIndex] | 1 << (i % 8)
    }

    return nd
  }
}
