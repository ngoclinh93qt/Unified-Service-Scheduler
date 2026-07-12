import { Test } from '@nestjs/testing';

import { PrismaService } from '../../../database/prisma.service';
import { PrismaAppointmentBookingGateway } from './prisma-appointment-booking.gateway';

describe('PrismaAppointmentBookingGateway dependency injection', () => {
  it('constructs without registering test transaction hooks', async () => {
    const module = await Test.createTestingModule({
      providers: [
        PrismaAppointmentBookingGateway,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    expect(module.get(PrismaAppointmentBookingGateway)).toBeInstanceOf(
      PrismaAppointmentBookingGateway,
    );
  });
});
