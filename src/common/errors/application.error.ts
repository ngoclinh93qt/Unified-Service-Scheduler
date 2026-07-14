export type ApplicationErrorCode =
  | 'INVALID_APPOINTMENT_TIME'
  | 'REFERENCE_NOT_FOUND'
  | 'REFERENCE_CONFLICT'
  | 'RESOURCES_UNAVAILABLE'
  | 'TRANSIENT_FAILURE';

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = ApplicationError.name;
  }
}
