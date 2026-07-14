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

  it('classifies a Prisma write conflict or deadlock as transient', () => {
    expect(isTransientFailure({ code: 'P2034' })).toBe(true);
  });

  it('does not classify a generic Prisma transaction-API error as transient', () => {
    expect(isTransientFailure({ code: 'P2028' })).toBe(false);
    expect(isTransientFailure({ code: 'P2028', meta: {} })).toBe(false);
    expect(
      isTransientFailure({
        code: 'P2028',
        meta: { operation: 'query', timeout: '100', timeTaken: 101 },
      }),
    ).toBe(false);
    expect(
      isTransientFailure({
        code: 'P2028',
        meta: { operation: 'query', timeout: 100, timeTaken: 99 },
      }),
    ).toBe(false);
  });

  it('classifies a structured Prisma transaction timeout as transient', () => {
    expect(
      isTransientFailure({
        code: 'P2028',
        meta: { operation: 'query', timeout: 100, timeTaken: 101 },
      }),
    ).toBe(true);
  });

  it('does not classify business or unknown failures as transient', () => {
    expect(isTransientFailure(driverError('23P01'))).toBe(false);
    expect(isTransientFailure(new Error('plain'))).toBe(false);
  });

  it('maps a proven transient failure to the stable application error', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    } as unknown as PrismaService;
    const gateway = new PrismaAppointmentBookingGateway(prisma);

    await expect(
      gateway.book({
        customerId: '10000000-0000-4000-8000-000000000001',
        vehicleId: '20000000-0000-4000-8000-000000000001',
        dealershipId: '30000000-0000-4000-8000-000000000001',
        serviceTypeId: '40000000-0000-4000-8000-000000000001',
        startTime: new Date('2030-01-15T10:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'TRANSIENT_FAILURE' });
  });
});
