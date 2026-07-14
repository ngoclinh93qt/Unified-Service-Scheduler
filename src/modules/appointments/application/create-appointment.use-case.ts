import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { ApplicationError } from '../../../common/errors/application.error';
import {
  APPOINTMENT_BOOKING_GATEWAY,
  type AppointmentBookingGateway,
  type BookedAppointment,
  type CreateAppointmentCommand,
} from './booking.types';
import { CLOCK, type Clock } from './clock';

@Injectable()
export class CreateAppointmentUseCase {
  constructor(
    @Inject(APPOINTMENT_BOOKING_GATEWAY)
    private readonly gateway: AppointmentBookingGateway,
    @Inject(CLOCK)
    private readonly now: Clock,
    @InjectPinoLogger(CreateAppointmentUseCase.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(command: CreateAppointmentCommand): Promise<BookedAppointment> {
    const startedAt = Date.now();
    try {
      this.assertStartsInFuture(command.startTime);
      const appointment = await this.gateway.book(command);
      this.logger.info(
        {
          event: 'booking_confirmed',
          appointmentId: appointment.id,
          dealershipId: appointment.dealershipId,
          serviceTypeId: appointment.serviceTypeId,
          serviceBayId: appointment.serviceBayId,
          technicianId: appointment.technicianId,
          durationMs: Date.now() - startedAt,
        },
        'Booking confirmed',
      );
      return appointment;
    } catch (error) {
      if (error instanceof ApplicationError) {
        this.logger.warn(
          {
            event: 'booking_rejected',
            code: error.code,
            dealershipId: command.dealershipId,
            serviceTypeId: command.serviceTypeId,
            durationMs: Date.now() - startedAt,
          },
          'Booking rejected',
        );
      }
      throw error;
    }
  }

  private assertStartsInFuture(startTime: Date): void {
    const startMs = startTime.getTime();
    if (!Number.isFinite(startMs) || startMs <= this.now().getTime()) {
      throw new ApplicationError(
        'INVALID_APPOINTMENT_TIME',
        'Appointment start time must be in the future',
      );
    }
  }
}
