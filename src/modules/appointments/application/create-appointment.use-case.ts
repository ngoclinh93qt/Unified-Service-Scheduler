import { Inject, Injectable } from '@nestjs/common';

import {
  APPOINTMENT_BOOKING_GATEWAY,
  type AppointmentBookingGateway,
  type BookedAppointment,
  type CreateAppointmentCommand,
} from './booking.types';

@Injectable()
export class CreateAppointmentUseCase {
  constructor(
    @Inject(APPOINTMENT_BOOKING_GATEWAY)
    private readonly gateway: AppointmentBookingGateway,
  ) {}

  execute(command: CreateAppointmentCommand): Promise<BookedAppointment> {
    return this.gateway.book(command);
  }
}
