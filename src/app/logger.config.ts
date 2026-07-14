import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Options } from 'pino-http';

type CorrelatedRequest = IncomingMessage & { requestId?: string };

function resolveRequestId(
  request: IncomingMessage,
  response: ServerResponse,
): string {
  const incoming = request.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' &&
    incoming.trim().length > 0 &&
    incoming.length <= 128
      ? incoming
      : randomUUID();

  (request as CorrelatedRequest).requestId = requestId;
  response.setHeader('x-request-id', requestId);
  return requestId;
}

export const pinoHttpOptions: Options = {
  level: process.env.LOG_LEVEL ?? 'info',
  genReqId: resolveRequestId,
  customProps: (request) => ({
    requestId: (request as CorrelatedRequest).requestId,
  }),
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    censor: '[Redacted]',
  },
};
