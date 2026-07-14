import { Inject, Injectable } from '@nestjs/common';

import { ApplicationError } from '../../../common/errors/application.error';
import {
  APPOINTMENT_BOOKING_GATEWAY,
  type AppointmentBookingGateway,
  type BookedAppointment,
} from './booking.types';

@Injectable()
export class GetAppointmentUseCase {
  constructor(
    @Inject(APPOINTMENT_BOOKING_GATEWAY)
    private readonly gateway: AppointmentBookingGateway,
  ) {}

  async execute(id: string): Promise<BookedAppointment> {
    const appointment = await this.gateway.findById(id);
    if (!appointment) {
      throw new ApplicationError(
        'REFERENCE_NOT_FOUND',
        'Appointment not found',
      );
    }
    return appointment;
  }
}
