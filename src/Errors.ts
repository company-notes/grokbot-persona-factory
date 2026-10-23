export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class AIUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
