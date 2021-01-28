import { CID } from 'multiformats'
import * as internal from './internal.js'
import { Node } from './node.js'
import { MAX_UINT64 } from './constants.js'
import { nodesForHeight } from './util.js'
import { CBORDecoder, IpldStore } from './types.js'
import { Link } from './link.js'
import { InvalidCountError } from './errors.js'

/**
 * Maximum index for elements in the AMT. This is golangs MaxUint64-1 so we
 * don't overflow MaxUint64 when computing the length.
 */
export const MAX_INDEX = MAX_UINT64 - 1n
export const DEFAULT_BIT_WIDTH = 3

export type Options = {
  bitWidth?: number
}

/**
 * Root is described in more detail in its internal serialized form,
 * internal.Root
 */
export class Root<T = any> {
  readonly bitWidth: number = DEFAULT_BIT_WIDTH
  private height: bigint = 0n
  private count: bigint = 0n
  private node: Node<T>
  private readonly store: IpldStore

  /**
   * Creates a new, empty AMT root with the given IpldStore and options.
   */
  constructor (bs: IpldStore, options: Options = {}) {
    this.store = bs
    if (options.bitWidth) {
      if (typeof options.bitWidth !== 'number') throw new Error('non-numeric bit width')
      if (options.bitWidth < 1) throw new Error(`bit width must be at least 2, is ${options.bitWidth}`)
      this.bitWidth = options.bitWidth
    }
    this.node = new Node<T>()
  }

  /**
   * Loads an existing AMT from the given IpldStore using the given
   * root CID. An error will be returned where the AMT identified by the CID
   * does not exist within the IpldStore. If the given options, or their defaults,
   * do not match the AMT found at the given CID, an error will be returned.
   */
  static async load<T = any> (bs: IpldStore, c: CID, options: Options = {}): Promise<Root<T>> {
    const ir = internal.Root.decodeCBOR(await bs.get(c))

    options.bitWidth = options.bitWidth ?? DEFAULT_BIT_WIDTH

    // Check the bitwidth but don't rely on it. We may add an option in the
    // future to just discover the bitwidth from the AMT, but we need to be
    // careful to not just trust the value.
    if (ir.bitWidth !== options.bitWidth) {
      throw new Error(`expected bit width ${options.bitWidth} but AMT has bit width ${ir.bitWidth}`)
    }

    // Make sure the height is sane to prevent any integer overflows later
    // (e.g., height+1). While MaxUint64-1 would solve the "+1" issue, we
    // might as well use 64 because the height cannot be greater than 62
    // (min width = 2, 2**64 == max elements).
    if (ir.height > 64n) {
      throw new Error(`height greater than 64: ${ir.height}`)
    }

    const maxNodes = nodesForHeight(options.bitWidth, ir.height + 1n)

    // nodesForHeight saturates. If "max nodes" is max uint64, the maximum
    // number of nodes at the previous level must be less. This is the
    // simplest way to check to see if the height is sane.
    if (maxNodes === MAX_UINT64 && nodesForHeight(options.bitWidth, ir.height) === MAX_UINT64) {
      throw new Error(`failed to load AMT: height ${ir.height} out of bounds`)
    }

    // If max nodes is less than the count, something is wrong.
    if (maxNodes < ir.count) {
      throw new Error(`failed to load AMT: not tall enough (${ir.height}) for count (${ir.count})`)
    }

    const r = new Root<T>(bs, options)
    r.height = ir.height
    r.count = ir.count
    r.node = Node.fromInternal(ir.node, options.bitWidth, ir.height === 0n, ir.height === 0n)

    return r
  }

  /**
   * Creates a new AMT and performs a batchSet on it using the vals and options
   * provided. Indexes from the array are used as the indexes for the same
   * values in the AMT.
   */
  static async fromArray (bs: IpldStore, vals: any[], options?: Options): Promise<CID> {
    const r = new Root(bs, options)
    await r.batchSet(vals)
    return r.flush()
  }

  /**
   * Set will add or update entry at index i with value val. The index must be
   * within lower than MaxIndex.
   *
   * Where val has a compatible CBORMarshaler() it will be used to serialize the
   * object into CBOR. Otherwise the generic go-ipld-cbor DumbObject() will be
   * used.
   *
   * Setting a new index that is greater than the current capacity of the
   * existing AMT structure will result in the creation of additional nodes to
   * form a structure of enough height to contain the new index.
   *
   * The height required to store any given index can be calculated by finding
   * the lowest (width^(height+1) - 1) that is higher than the index. For example,
   * a height of 1 on an AMT with a width of 8 (bitWidth of 3) can fit up to
   * indexes of 8^2 - 1, or 63. At height 2, indexes up to 511 can be stored. So a
   * Set operation for an index between 64 and 511 will require that the AMT have
   * a height of at least 3. Where an AMT has a height less than 3, additional
   * nodes will be added until the height is 3.
   */
  async set (i: bigint, val: T) {
    if (i > MAX_INDEX) {
      throw new RangeError(`index ${i} is out of range for the amt`)
    }

    // while the index is greater than the number of elements we can fit into the
    // current AMT, grow it until it will fit.
    while (i >= nodesForHeight(this.bitWidth, this.height + 1n)) {
      // if we have existing data, perform the re-height here by pushing down
      // the existing tree into the left-most portion of a new root
      if (!this.node.empty()) {
        const nd = this.node
        // since all our current elements fit in the old height, we _know_ that
        // they will all sit under element [0] of this new node.
        this.node = new Node([new Link(undefined, nd, true)])
      }
      // else we still need to add new nodes to form the right height, but we can
      // defer that to our set() call below which will lazily create new nodes
      // where it expects there to be some
      this.height++
    }

    const addVal = await this.node.set(this.store, this.bitWidth, this.height, i, val)

    if (addVal) {
      // Something is wrong, so we'll just do our best to not overflow.
      if (this.count >= MAX_INDEX - 1n) {
        throw new InvalidCountError()
      }
      this.count++
    }
  }

  /**
   * BatchSet takes an array of vals and performs a Set on each of them on an
   * existing AMT. Indexes from the array are used as indexes for the same
   * values in the AMT.
   *
   * This is currently a convenience method and does not perform optimizations
   * above iterative Set calls for each entry.
   */
  async batchSet (vals: any[]) {
    // TODO: there are more optimized ways of doing this method
    for (const i in vals) {
      await this.set(BigInt(i), vals[i])
    }
  }

  /**
   * Get retrieves a value from index i.
   *
   * If the index is set, returns true and, if the `out` parameter is not nil,
   * deserializes the value into that interface. Returns undefined if the index
   * is not set.
   */
  async get (i: bigint, decoder?: CBORDecoder<T>): Promise<T | undefined> {
    if (i > MAX_INDEX) {
      throw new RangeError(`index ${i} is out of range for the amt`)
    }
    // easy shortcut case, index is too large for our height, don't bother
    // looking further
    if (i >= nodesForHeight(this.bitWidth, this.height + 1n)) {
      return
    }
    return this.node.get(this.store, this.bitWidth, this.height, i, decoder)
  }

  /**
   * Performs a bulk Delete operation on an array of indices. Each index in the
   * given indices array will be removed from the AMT, if it is present.
   * If `strict` is true, all indices are expected to be present, and this will
   * throw an error if one is not found.
   *
   * Returns true if the AMT was modified as a result of this operation.
   *
   * There is no special optimization applied to this method, it is simply a
   * convenience wrapper around Delete for an array of indices.
   */
  async batchDelete (indices: bigint[], strict: boolean): Promise<boolean> {
    // TODO: theres a faster way of doing this, but this works for now

    // Sort by index so we can safely implement these optimizations in the future.
    indices = Array.from(indices).sort((a, b) => {
      if (a < b) return -1
      if (a > b) return 1
      return 0
    })

    let modified = false
    for (const i of indices) {
      const found = await this.delete(i)
      if (strict && !found) {
        throw new Error(`no such index ${i}`)
      }
      modified = modified || found
    }
    return modified
  }

  /**
   * Removes an index from the AMT.
   * Returns true if the index was present and removed, or false if the index
   * was not set.
   *
   * If this delete operation leaves nodes with no remaining elements, the
   * height will be reduced to fit the maximum remaining index, leaving the AMT
   * in canonical form for the given set of data that it contains.
   */
  async delete (i: bigint): Promise<boolean> {
    if (i > MAX_INDEX) {
      throw new RangeError(`index ${i} is out of range for the amt`)
    }

    // shortcut, index is greater than what we hold so we know it's not there
    if (i >= nodesForHeight(this.bitWidth, this.height + 1n)) {
      return false
    }

    const found = await this.node.delete(this.store, this.bitWidth, this.height, i)
    if (!found) {
      return false
    }

    // The AMT invariant dictates that for any non-empty AMT, the root node must
    // not address only its left-most child node. Where a deletion has created a
    // state where the current root node only consists of a link to the left-most
    // child and no others, that child node must become the new root node (i.e.
    // the height is reduced by 1). We perform the same check on the new root node
    // such that we reduce the AMT to canonical form for this data set.
    // In the extreme case, it is possible to perform a collapse from a large
    // `height` to height=0 where the index being removed is very large and there
    // remains no other indexes or the remaining indexes are in the range of 0 to
    // bitWidth^8.
    // See node.collapse() for more notes.
    this.height = await this.node.collapse(this.store, this.bitWidth, this.height)

    // Something is very wrong but there's not much we can do. So we perform
    // the operation and then tell the user that something is wrong.
    if (this.count === 0n) {
      throw new InvalidCountError()
    }

    this.count--
    return true
  }

  [Symbol.asyncIterator] () {
    return this.values()
  }

  /**
   * Returns an AsyncGenerator that iterates over the entire AMT.
   */
  entries (decoder?: CBORDecoder<T>) {
    return this.node.entries(this.store, this.bitWidth, this.height, decoder)
  }

  /**
   * Returns an AsyncGenerator that iterates over the keys of the entire AMT.
   */
  async * keys () {
    for await (const kv of this.entries()) {
      yield kv[0]
    }
  }

  /**
   * Returns an AsyncGenerator that iterates over the values of the entire AMT.
   */
  async * values (decoder?: CBORDecoder<T>) {
    for await (const kv of this.entries(decoder)) {
      yield kv[1]
    }
  }

  /**
   * FirstSetIndex finds the lowest index in this AMT that has a value set for
   * it. If this operation is called on an empty AMT, an ErrNoValues will be
   * thrown.
   */
  firstSetIndex (): Promise<bigint> {
    return this.node.firstSetIndex(this.store, this.bitWidth, this.height)
  }

  /**
   * Flush saves any unsaved node data and recompacts the in-memory forms of
   * each node where they have been expanded for operational use.
   */
  async flush (): Promise<CID> {
    const nd = await this.node.flush(this.store, this.bitWidth, this.height)
    const root = new internal.Root(this.bitWidth, this.height, this.count, nd)
    return this.store.put(root.encodeCBOR())
  }

  /**
   * Returns the "count" property that is stored in the root of this AMT.
   * It's correctness is only guaranteed by the consistency of the build of the
   * AMT (i.e. this code). A "secure" count would require iterating the entire
   * tree, but if all nodes are part of a trusted structure (e.g. one where we
   * control the entire build, or verify all incoming blocks from untrusted
   * sources) then we ought to be able to say "count" is correct.
   */
  get size (): bigint {
    return this.count
  }
}
