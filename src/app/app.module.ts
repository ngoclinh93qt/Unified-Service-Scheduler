import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { appConfigValidationSchema } from '../common/config/app.config';
import { ProblemDetailsFilter } from '../common/errors/problem-details.filter';
import { RequestIdMiddleware } from '../common/http/request-id.middleware';
import { PrismaModule } from '../database/prisma.module';
import { HealthModule } from '../health/health.module';
import { AppointmentsModule } from '../modules/appointments/appointments.module';

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
      },
    }),
    PrismaModule,
    HealthModule,
    AppointmentsModule,
  ],
  providers: [ProblemDetailsFilter, RequestIdMiddleware],
})
export class AppModule {}
