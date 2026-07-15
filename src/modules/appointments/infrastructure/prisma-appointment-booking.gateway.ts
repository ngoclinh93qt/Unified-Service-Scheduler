import { Injectable, Optional } from '@nestjs/common';
import { Appointment, Prisma } from '@prisma/client';

import { ApplicationError } from '../../../common/errors/application.error';
import { PrismaService } from '../../../database/prisma.service';
import {
  AppointmentBookingGateway,
  BookedAppointment,
  CreateAppointmentCommand,
} from '../application/booking.types';
import { AppointmentInterval } from '../domain/appointment-interval';

type Candidate = Readonly<{ id: string }>;

export type BookingTransactionHooks = Readonly<{
  beforeResourcesLocked?: () => Promise<void>;
  afterResourcesLocked?: () => Promise<void>;
}>;

@Injectable()
export class PrismaAppointmentBookingGateway implements AppointmentBookingGateway {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly hooks: BookingTransactionHooks = {},
  ) {}

  async book(command: CreateAppointmentCommand): Promise<BookedAppointment> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => this.bookInTransaction(transaction, command),
        // Bound queue and transaction time under contention.
        { maxWait: 5_000, timeout: 10_000 },
      );
    } catch (error) {
      // Internal retry is deferred; clients receive a retryable 503.
      if (isTransientFailure(error)) {
        throw new ApplicationError(
          'TRANSIENT_FAILURE',
          'The booking could not be completed due to temporary contention; retry the request',
        );
      }
      throw error;
    }
  }

  async findById(id: string): Promise<BookedAppointment | null> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });
    return appointment ? toBookedAppointment(appointment) : null;
  }

  private async bookInTransaction(
    transaction: Prisma.TransactionClient,
    command: CreateAppointmentCommand,
  ): Promise<BookedAppointment> {
    // Keep validated ownership and service duration stable until commit.
    const [customer] = await transaction.$queryRaw<Candidate[]>(Prisma.sql`
      SELECT id FROM customers WHERE id = ${command.customerId}::uuid FOR SHARE
    `);
    const [vehicle] = await transaction.$queryRaw<
      Array<Readonly<{ id: string; customerId: string }>>
    >(Prisma.sql`
      SELECT id, customer_id AS "customerId"
      FROM vehicles WHERE id = ${command.vehicleId}::uuid FOR SHARE
    `);
    const [dealership] = await transaction.$queryRaw<Candidate[]>(Prisma.sql`
      SELECT id FROM dealerships
      WHERE id = ${command.dealershipId}::uuid FOR SHARE
    `);
    const [serviceType] = await transaction.$queryRaw<
      Array<Readonly<{ id: string; durationMinutes: number; active: boolean }>>
    >(Prisma.sql`
      SELECT id, duration_minutes AS "durationMinutes", active
      FROM service_types WHERE id = ${command.serviceTypeId}::uuid FOR SHARE
    `);

    if (!customer) throw referenceNotFound('Customer');
    if (!vehicle) throw referenceNotFound('Vehicle');
    if (!dealership) throw referenceNotFound('Dealership');
    if (!serviceType) throw referenceNotFound('Service type');
    if (vehicle.customerId !== customer.id) {
      throw new ApplicationError(
        'REFERENCE_CONFLICT',
        'Vehicle does not belong to the customer',
      );
    }
    if (!serviceType.active) throw resourcesUnavailable();

    const interval = AppointmentInterval.create(
      command.startTime,
      serviceType.durationMinutes,
    );
    await this.hooks.beforeResourcesLocked?.();
    const bays = await transaction.$queryRaw<Candidate[]>(Prisma.sql`
      SELECT b.id
      FROM service_bays b
      WHERE b.dealership_id = ${dealership.id}::uuid
        AND b.active = true
      ORDER BY b.id
      FOR UPDATE
    `);
    // Prevent qualification revocation before the booking commits.
    const technicians = await transaction.$queryRaw<Candidate[]>(Prisma.sql`
      SELECT t.id
      FROM technicians t
      INNER JOIN technician_qualifications q ON q.technician_id = t.id
      WHERE t.dealership_id = ${dealership.id}::uuid
        AND t.active = true
        AND q.service_type_id = ${serviceType.id}::uuid
      ORDER BY t.id
      FOR UPDATE OF t, q
    `);
    await this.hooks.afterResourcesLocked?.();

    const [timeCheck] = await transaction.$queryRaw<
      Array<Readonly<{ valid: boolean }>>
    >(Prisma.sql`
      SELECT ${command.startTime}::timestamptz > clock_timestamp() AS valid
    `);
    if (!timeCheck?.valid) {
      throw new ApplicationError(
        'INVALID_APPOINTMENT_TIME',
        'Appointment start time must be in the future',
      );
    }

    const vehicleOverlap = await transaction.appointment.findFirst({
      where: {
        vehicleId: vehicle.id,
        startTime: { lt: interval.end },
        endTime: { gt: interval.start },
        status: 'CONFIRMED',
      },
      select: { id: true },
    });
    if (vehicleOverlap) throw resourcesUnavailable();

    const serviceBay = await firstAvailableCandidate(
      transaction,
      bays,
      'serviceBayId',
      interval,
    );
    const technician = await firstAvailableCandidate(
      transaction,
      technicians,
      'technicianId',
      interval,
    );
    if (!serviceBay) throw resourcesUnavailable();
    if (!technician) throw resourcesUnavailable();

    try {
      const appointment = await transaction.appointment.create({
        data: {
          customerId: customer.id,
          vehicleId: vehicle.id,
          dealershipId: dealership.id,
          serviceTypeId: serviceType.id,
          serviceBayId: serviceBay.id,
          technicianId: technician.id,
          startTime: interval.start,
          endTime: interval.end,
        },
      });
      return toBookedAppointment(appointment);
    } catch (error) {
      // Database constraints are the final overlap safeguard.
      if (isExclusionViolation(error)) throw resourcesUnavailable();
      throw error;
    }
  }
}

async function firstAvailableCandidate(
  transaction: Prisma.TransactionClient,
  candidates: Candidate[],
  resource: 'serviceBayId' | 'technicianId',
  interval: AppointmentInterval,
): Promise<Candidate | undefined> {
  for (const candidate of candidates) {
    const overlap = await transaction.appointment.findFirst({
      where: {
        [resource]: candidate.id,
        startTime: { lt: interval.end },
        endTime: { gt: interval.start },
        status: 'CONFIRMED',
      },
      select: { id: true },
    });
    if (!overlap) return candidate;
  }

  return undefined;
}

const EXCLUSION_VIOLATION = '23P01';
// P2028 is only transient when its metadata proves a transaction timeout.
const TRANSIENT_CODES = new Set(['40P01', '55P03', '57014', 'P2034']);

type ErrorCause = Readonly<{
  code?: unknown;
  meta?: { timeout?: unknown; timeTaken?: unknown };
  cause?: unknown;
}>;

// Prisma driver adapters may place SQLSTATE on a nested cause.
function causeChainSome(
  error: unknown,
  matches: (candidate: ErrorCause) => boolean,
): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) return false;
    const candidate = current as ErrorCause;
    if (matches(candidate)) return true;
    current = candidate.cause;
  }
  return false;
}

export function isExclusionViolation(error: unknown): boolean {
  return causeChainSome(error, ({ code }) => code === EXCLUSION_VIOLATION);
}

export function isTransientFailure(error: unknown): boolean {
  return (
    causeChainSome(
      error,
      ({ code }) => typeof code === 'string' && TRANSIENT_CODES.has(code),
    ) || causeChainHasStructuredTransactionTimeout(error)
  );
}

function causeChainHasStructuredTransactionTimeout(error: unknown): boolean {
  return causeChainSome(error, (candidate) => {
    const timeout = candidate.meta?.timeout;
    const timeTaken = candidate.meta?.timeTaken;
    return (
      candidate.code === 'P2028' &&
      typeof timeout === 'number' &&
      Number.isFinite(timeout) &&
      timeout > 0 &&
      typeof timeTaken === 'number' &&
      Number.isFinite(timeTaken) &&
      timeTaken >= timeout
    );
  });
}

function referenceNotFound(reference: string): ApplicationError {
  return new ApplicationError('REFERENCE_NOT_FOUND', `${reference} not found`);
}

function resourcesUnavailable(): ApplicationError {
  return new ApplicationError(
    'RESOURCES_UNAVAILABLE',
    'The vehicle or required service resources are unavailable for the requested time',
  );
}

function toBookedAppointment(appointment: Appointment): BookedAppointment {
  return {
    id: appointment.id,
    customerId: appointment.customerId,
    vehicleId: appointment.vehicleId,
    dealershipId: appointment.dealershipId,
    serviceTypeId: appointment.serviceTypeId,
    serviceBayId: appointment.serviceBayId,
    technicianId: appointment.technicianId,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: appointment.status,
  };
}
