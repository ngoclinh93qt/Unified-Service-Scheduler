export type ApplicationErrorCode =
  'REFERENCE_NOT_FOUND' | 'REFERENCE_CONFLICT' | 'RESOURCES_UNAVAILABLE';

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = ApplicationError.name;
  }
}
