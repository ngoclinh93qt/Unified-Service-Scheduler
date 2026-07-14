import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { appConfigValidationSchema } from '../common/config/app.config';
import { ProblemDetailsFilter } from '../common/errors/problem-details.filter';
import { PrismaModule } from '../database/prisma.module';
import { HealthModule } from '../health/health.module';
import { AppointmentsModule } from '../modules/appointments/appointments.module';
import { pinoHttpOptions } from './logger.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: appConfigValidationSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: pinoHttpOptions,
    }),
    PrismaModule,
    HealthModule,
    AppointmentsModule,
  ],
  providers: [ProblemDetailsFilter],
})
export class AppModule {}
