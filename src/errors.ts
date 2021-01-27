export class EmptyNodeError extends Error {
  constructor (msg: string = 'unexpected empty amt node') {
    super(msg)
  }
}

export class UndefinedCIDError extends Error {
  constructor (msg: string = 'amt node has undefined CID') {
    super(msg)
  }
}

export class LinksAndValuesError extends Error {
  constructor (msg: string = 'amt node has both links and values') {
    super(msg)
  }
}

export class LeafUnexpectedError extends Error {
  constructor (msg: string = 'amt leaf not expected at height') {
    super(msg)
  }
}

export class LeafExpectedError extends Error {
  constructor (msg: string = 'amt expected at height') {
    super(msg)
  }
}

export class InvalidCountError extends Error {
  constructor (msg: string = 'amt count does not match number of elements') {
    super(msg)
  }
}

export class NoValuesError extends Error {
  constructor (msg: string = 'no values') {
    super(msg)
  }
}
