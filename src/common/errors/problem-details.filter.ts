import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { STATUS_CODES } from 'node:http';
import { ApplicationError, ApplicationErrorCode } from './application.error';

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  timestamp: string;
  requestId: string;
  errors?: ReadonlyArray<{ field: string; message: string }>;
};

type RequestWithId = Request & { requestId?: string };

const applicationStatuses: Record<ApplicationErrorCode, number> = {
  INVALID_APPOINTMENT_TIME: HttpStatus.BAD_REQUEST,
  REFERENCE_NOT_FOUND: HttpStatus.NOT_FOUND,
  REFERENCE_CONFLICT: HttpStatus.CONFLICT,
  RESOURCES_UNAVAILABLE: HttpStatus.CONFLICT,
  TRANSIENT_FAILURE: HttpStatus.SERVICE_UNAVAILABLE,
};

@Injectable()
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(ProblemDetailsFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const problem = this.toProblem(exception, request);

    if (
      !(exception instanceof HttpException) &&
      !(exception instanceof ApplicationError)
    ) {
      this.logger.error(
        {
          requestId: problem.requestId,
          errorType:
            exception instanceof Error ? exception.name : typeof exception,
        },
        'Unexpected request failure',
      );
    }

    if (problem.code === 'TRANSIENT_FAILURE') {
      // The command may succeed on retry once the contention clears; internal
      // retry is deferred, so surface the hint to the client instead.
      response.setHeader('Retry-After', '1');
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .send(problem);
  }

  private toProblem(
    exception: unknown,
    request: RequestWithId,
  ): ProblemDetails {
    const base = {
      instance: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
      requestId: request.requestId ?? 'unknown',
    };

    if (exception instanceof ApplicationError) {
      const status = applicationStatuses[exception.code];
      return this.problem(status, exception.code, exception.message, base);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const messages = this.validationMessages(payload);
      const detail = this.httpDetail(payload, exception.message);
      const code = messages ? 'VALIDATION_ERROR' : this.httpCode(status);
      const problem = this.problem(status, code, detail, base);

      return messages
        ? {
            ...problem,
            errors: messages.map((message) => ({
              field: fieldFromValidationMessage(message),
              message,
            })),
          }
        : problem;
    }

    return this.problem(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR',
      'An unexpected error occurred',
      base,
    );
  }

  private problem(
    status: number,
    code: string,
    detail: string,
    base: Pick<ProblemDetails, 'instance' | 'timestamp' | 'requestId'>,
  ): ProblemDetails {
    return {
      type: `urn:service-scheduler:problem:${code.toLowerCase().replaceAll('_', '-')}`,
      title: STATUS_CODES[status] ?? 'Error',
      status,
      detail,
      code,
      ...base,
    };
  }

  private validationMessages(payload: string | object): string[] | undefined {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('message' in payload)
    ) {
      return undefined;
    }
    const message = payload.message;
    return Array.isArray(message) &&
      message.every((item) => typeof item === 'string')
      ? message
      : undefined;
  }

  private httpDetail(payload: string | object, fallback: string): string {
    if (typeof payload === 'string') return payload;
    if ('message' in payload && typeof payload.message === 'string') {
      return payload.message;
    }
    return fallback;
  }

  private httpCode(status: number): string {
    return (STATUS_CODES[status] ?? 'HTTP_ERROR')
      .toUpperCase()
      .replaceAll(/[^A-Z0-9]+/g, '_')
      .replaceAll(/^_|_$/g, '');
  }
}

// class-validator messages lead with the property name, except whitelist
// violations which are phrased "property <name> should not exist".
function fieldFromValidationMessage(message: string): string {
  const words = message.split(' ');
  return (words[0] === 'property' ? words[1] : words[0]) ?? '';
}
