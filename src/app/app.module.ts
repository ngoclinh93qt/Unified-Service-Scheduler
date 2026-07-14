import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { appConfigValidationSchema } from '../common/config/app.config';
import { ProblemDetailsFilter } from '../common/errors/problem-details.filter';
import { PrismaModule } from '../database/prisma.module';
import { HealthModule } from '../health/health.module';
import { AppointmentsModule } from '../modules/appointments/appointments.module';

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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: appConfigValidationSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: resolveRequestId,
        customProps: (request) => ({
          requestId: (request as CorrelatedRequest).requestId,
        }),
      },
    }),
    PrismaModule,
    HealthModule,
    AppointmentsModule,
  ],
  providers: [ProblemDetailsFilter],
})
export class AppModule {}
