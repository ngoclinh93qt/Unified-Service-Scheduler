import { Test } from '@nestjs/testing';

import { PrismaService } from '../../../database/prisma.service';
import {
  isExclusionViolation,
  isTransientFailure,
  PrismaAppointmentBookingGateway,
} from './prisma-appointment-booking.gateway';

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

describe('failure classification', () => {
  // Mirrors the observed driver-adapter shape: the SQLSTATE sits on the cause
  // chain, not on the top-level error.
  function driverError(code: string): Error {
    const error = new Error('driver failure');
    (error as Error & { cause: unknown }).cause = { kind: 'postgres', code };
    return error;
  }

  it('recognizes an exclusion violation on the cause chain', () => {
    expect(isExclusionViolation(driverError('23P01'))).toBe(true);
    expect(isExclusionViolation(driverError('40P01'))).toBe(false);
    expect(isExclusionViolation(new Error('plain'))).toBe(false);
    expect(isExclusionViolation(undefined)).toBe(false);
  });

  it.each([
    ['deadlock', '40P01'],
    ['lock timeout', '55P03'],
    ['statement timeout', '57014'],
  ])('classifies a %s as transient', (_label, code) => {
    expect(isTransientFailure(driverError(code))).toBe(true);
  });

  it('classifies a Prisma transaction-API timeout as transient', () => {
    expect(isTransientFailure({ code: 'P2028' })).toBe(true);
  });

  it('does not classify business or unknown failures as transient', () => {
    expect(isTransientFailure(driverError('23P01'))).toBe(false);
    expect(isTransientFailure(new Error('plain'))).toBe(false);
  });
});
