import { ApiProperty } from '@nestjs/swagger';

import type { BookedAppointment } from '../application/booking.types';

export class AppointmentResponse {
  @ApiProperty({ example: '70000000-0000-4000-8000-000000000001' })
  id!: string;

  @ApiProperty({ example: '10000000-0000-4000-8000-000000000001' })
  customerId!: string;

  @ApiProperty({ example: '20000000-0000-4000-8000-000000000001' })
  vehicleId!: string;

  @ApiProperty({ example: '30000000-0000-4000-8000-000000000001' })
  dealershipId!: string;

  @ApiProperty({ example: '40000000-0000-4000-8000-000000000001' })
  serviceTypeId!: string;

  @ApiProperty({ example: '50000000-0000-4000-8000-000000000001' })
  serviceBayId!: string;

  @ApiProperty({ example: '60000000-0000-4000-8000-000000000001' })
  technicianId!: string;

  @ApiProperty({ example: '2026-07-14T08:00:00.000Z', format: 'date-time' })
  startTime!: string;

  @ApiProperty({ example: '2026-07-14T09:00:00.000Z', format: 'date-time' })
  endTime!: string;

  @ApiProperty({ example: 'CONFIRMED', enum: ['CONFIRMED'] })
  status!: 'CONFIRMED';

  static from(appointment: BookedAppointment): AppointmentResponse {
    return {
      ...appointment,
      startTime: appointment.startTime.toISOString(),
      endTime: appointment.endTime.toISOString(),
    };
  }
}
