export class HTTPError extends Error {
  constructor(message: string, readonly status: number, readonly errorCode: string) {
    super(message);
  }
}
