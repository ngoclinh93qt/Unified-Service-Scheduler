import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

type CorrelatedRequest = Request & {
  requestId?: string;
  log?: {
    info: (bindings: Record<string, unknown>, message: string) => void;
  };
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    request: CorrelatedRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const incoming = request.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' &&
      incoming.trim().length > 0 &&
      incoming.length <= 128
        ? incoming
        : randomUUID();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    request.log?.info(
      { requestId, method: request.method, path: request.originalUrl },
      'Request received',
    );
    next();
  }
}
