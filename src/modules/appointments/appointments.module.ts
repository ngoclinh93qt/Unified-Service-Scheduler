import { Module } from '@nestjs/common';

import { APPOINTMENT_BOOKING_GATEWAY } from './application/booking.types';
import { CLOCK, systemClock } from './application/clock';
import { CreateAppointmentUseCase } from './application/create-appointment.use-case';
import { GetAppointmentUseCase } from './application/get-appointment.use-case';
import { AppointmentsController } from './http/appointments.controller';
import { PrismaAppointmentBookingGateway } from './infrastructure/prisma-appointment-booking.gateway';

@Module({
  controllers: [AppointmentsController],
  providers: [
    CreateAppointmentUseCase,
    GetAppointmentUseCase,
    PrismaAppointmentBookingGateway,
    { provide: CLOCK, useValue: systemClock },
    {
      provide: APPOINTMENT_BOOKING_GATEWAY,
      useExisting: PrismaAppointmentBookingGateway,
    },
  ],
})
export class AppointmentsModule {}
