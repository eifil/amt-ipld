import { MAX_UINT64 } from './constants.js'

/**
 * Given height 'height', how many nodes in a maximally full tree can we
 * build? (bitWidth^2)^height = width^height. If we pass in height+1 we can work
 * out how many elements a maximally full tree can hold, width^(height+1).
 */
export function nodesForHeight (bitWidth: number, height: bigint): bigint {
  const heightLogTwo = BigInt(bitWidth) * height
  if (heightLogTwo >= 64) {
    // The max depth layer may not be full.
    return MAX_UINT64
  }
  return 1n << heightLogTwo
}
