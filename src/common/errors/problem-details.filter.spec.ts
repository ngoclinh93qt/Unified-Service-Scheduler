import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ApplicationError } from './application.error';
import { ProblemDetails, ProblemDetailsFilter } from './problem-details.filter';

describe('ProblemDetailsFilter', () => {
  const status = jest.fn().mockReturnThis();
  const type = jest.fn().mockReturnThis();
  const send = jest.fn<void, [ProblemDetails]>();
  const response = { status, type, send };
  const request = {
    originalUrl: '/api/v1/appointments',
    requestId: 'request-123',
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  const logError = jest.fn<void, [Record<string, unknown>, string]>();
  const logger = { error: logError } as unknown as PinoLogger;
  const filter = new ProblemDetailsFilter(logger);

  beforeEach(() => {
    jest.clearAllMocks();
    status.mockReturnThis();
    type.mockReturnThis();
  });

  it('maps validation failures to field-level problem details', () => {
    filter.catch(
      new BadRequestException({
        message: ['startTime must be an ISO 8601 date string'],
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(type).toHaveBeenCalledWith('application/problem+json');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        code: 'VALIDATION_ERROR',
        requestId: 'request-123',
        instance: '/api/v1/appointments',
        errors: [
          {
            field: 'startTime',
            message: 'startTime must be an ISO 8601 date string',
          },
        ],
      }),
    );
  });

  it('maps application errors to their stable public status and code', () => {
    filter.catch(
      new ApplicationError('REFERENCE_NOT_FOUND', 'Service type not found'),
      host,
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'REFERENCE_NOT_FOUND',
        detail: 'Service type not found',
      }),
    );
  });

  it('sanitizes unexpected failures in both the response and logs', () => {
    const failure = new Error('database password leaked');

    filter.catch(failure, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        detail: 'An unexpected error occurred',
      }),
    );
    expect(send.mock.calls[0]?.[0].detail).not.toContain('password');
    const logged = logError.mock.calls[0]?.[0];
    expect(logged).toEqual({
      requestId: 'request-123',
      errorType: 'Error',
    });
    expect(logged).not.toHaveProperty('error');
    expect(logged).not.toHaveProperty('message');
    expect(logged).not.toHaveProperty('stack');
  });
});
