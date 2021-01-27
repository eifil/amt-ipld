declare module '@ipld/dag-cbor' {
  export const name: string
  export const code: number

  export function encode (obj: any): Uint8Array
  export function decode (d: Uint8Array): any
}
