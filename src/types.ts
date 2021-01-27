import CID from 'cids'

export interface IpldStore {
  get<V = any> (c: CID): Promise<V | undefined>
  put (v: any): Promise<CID>
}

export interface CBOREncoder {
  encodeCBOR (): any
}

export interface CBORDecoder<D> {
  decodeCBOR (obj: any): D
}
