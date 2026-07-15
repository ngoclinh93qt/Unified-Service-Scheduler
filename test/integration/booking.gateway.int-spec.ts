import { Prisma } from '@prisma/client';

import { PrismaService } from '../../src/database/prisma.service';
import { CreateAppointmentCommand } from '../../src/modules/appointments/application/booking.types';
import {
  isExclusionViolation,
  isTransientFailure,
  PrismaAppointmentBookingGateway,
} from '../../src/modules/appointments/infrastructure/prisma-appointment-booking.gateway';
import {
  PostgresTestEnvironment,
  startPostgresTestEnvironment,
} from '../helpers/postgres-test-environment';

const ids = {
  customer: '10000000-0000-4000-8000-000000000001',
  otherCustomer: '10000000-0000-4000-8000-000000000002',
  vehicle: '20000000-0000-4000-8000-000000000001',
  otherVehicle: '20000000-0000-4000-8000-000000000002',
  thirdVehicle: '20000000-0000-4000-8000-000000000003',
  dealership: '30000000-0000-4000-8000-000000000001',
  otherDealership: '30000000-0000-4000-8000-000000000002',
  serviceType: '40000000-0000-4000-8000-000000000001',
  otherServiceType: '40000000-0000-4000-8000-000000000002',
  bayA: '50000000-0000-4000-8000-000000000001',
  bayB: '50000000-0000-4000-8000-000000000002',
  technicianA: '60000000-0000-4000-8000-000000000001',
  technicianB: '60000000-0000-4000-8000-000000000002',
} as const;

describe('PrismaAppointmentBookingGateway', () => {
  let environment: PostgresTestEnvironment;
  let prisma: PrismaService;
  let gateway: PrismaAppointmentBookingGateway;

  beforeAll(async () => {
    environment = await startPostgresTestEnvironment();
    prisma = environment.prisma;
    gateway = new PrismaAppointmentBookingGateway(prisma);
  });

  afterAll(async () => {
    await environment?.stop();
  });

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.technicianQualification.deleteMany();
    await prisma.technician.deleteMany();
    await prisma.serviceBay.deleteMany();
    await prisma.serviceType.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.dealership.deleteMany();
    await seedAvailablePair(prisma);
  });

  it('selects the first free bay and first qualified technician by id', async () => {
    const result = await gateway.book(commandAt('2099-07-14T08:00:00Z'));
    expect(result.serviceBayId).toBe(ids.bayA);
    expect(result.technicianId).toBe(ids.technicianA);
    await expect(prisma.appointment.count()).resolves.toBe(1);
  });

  it('allows a booking that starts exactly when another ends', async () => {
    await gateway.book(commandAt('2099-07-14T08:00:00Z'));
    await expect(
      gateway.book(commandAt('2099-07-14T09:00:00Z')),
    ).resolves.toMatchObject({ startTime: new Date('2099-07-14T09:00:00Z') });
  });

  it('uses another pair when the first pair overlaps', async () => {
    await gateway.book(commandAt('2099-07-14T08:00:00Z'));
    const second = await gateway.book(
      commandForVehicle('2099-07-14T08:30:00Z', ids.otherVehicle),
    );
    expect(second.serviceBayId).toBe(ids.bayB);
    expect(second.technicianId).toBe(ids.technicianB);
  });

  it('rejects an overlapping appointment for the same vehicle', async () => {
    await gateway.book(commandAt('2099-07-14T08:00:00Z'));

    await expect(
      gateway.book(commandAt('2099-07-14T08:30:00Z')),
    ).rejects.toMatchObject({ code: 'RESOURCES_UNAVAILABLE' });
    await expect(prisma.appointment.count()).resolves.toBe(1);
  });

  it('rejects an elapsed start time inside the authoritative transaction', async () => {
    await expect(
      gateway.book(commandAt(new Date(Date.now() - 1_000).toISOString())),
    ).rejects.toMatchObject({ code: 'INVALID_APPOINTMENT_TIME' });
    await expect(prisma.appointment.count()).resolves.toBe(0);
  });

  it('allocates a single pair to exactly one competing transaction', async () => {
    await prisma.technicianQualification.delete({
      where: {
        technicianId_serviceTypeId: {
          technicianId: ids.technicianB,
          serviceTypeId: ids.serviceType,
        },
      },
    });
    await prisma.technician.delete({ where: { id: ids.technicianB } });
    await prisma.serviceBay.delete({ where: { id: ids.bayB } });

    const barrier = twoPartyBarrier();
    const competingGateway = new PrismaAppointmentBookingGateway(prisma, {
      beforeResourcesLocked: barrier.arrive,
    });
    const first = competingGateway.book(commandAt('2099-07-14T08:00:00Z'));
    const second = competingGateway.book(commandAt('2099-07-14T08:00:00Z'));

    const results = await Promise.allSettled([first, second]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { code: 'RESOURCES_UNAVAILABLE' },
    });
    await expect(prisma.appointment.count()).resolves.toBe(1);
  });

  it('rechecks after contention and allocates two vehicles to distinct pairs', async () => {
    const barrier = twoPartyBarrier();
    const competingGateway = new PrismaAppointmentBookingGateway(prisma, {
      beforeResourcesLocked: barrier.arrive,
    });

    const [first, second] = await Promise.all([
      competingGateway.book(commandAt('2099-07-14T08:00:00Z')),
      competingGateway.book(
        commandForVehicle('2099-07-14T08:00:00Z', ids.otherVehicle),
      ),
    ]);

    expect([first.serviceBayId, second.serviceBayId].sort()).toEqual(
      [ids.bayA, ids.bayB].sort(),
    );
    expect([first.technicianId, second.technicianId].sort()).toEqual(
      [ids.technicianA, ids.technicianB].sort(),
    );
    await expect(prisma.appointment.count()).resolves.toBe(2);
  });

  it('rolls back and reports unavailable when no full pair exists', async () => {
    await gateway.book(commandAt('2099-07-14T08:00:00Z'));
    await gateway.book(
      commandForVehicle('2099-07-14T08:00:00Z', ids.otherVehicle),
    );
    await expect(
      gateway.book(commandForVehicle('2099-07-14T08:30:00Z', ids.thirdVehicle)),
    ).rejects.toMatchObject({
      code: 'RESOURCES_UNAVAILABLE',
    });
    await expect(prisma.appointment.count()).resolves.toBe(2);
  });

  it('reports a missing service type before allocation', async () => {
    await expect(
      gateway.book({
        ...commandAt('2099-07-14T08:00:00Z'),
        serviceTypeId: ids.otherServiceType,
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_NOT_FOUND' });
  });

  it('rejects a vehicle that belongs to another customer', async () => {
    await prisma.customer.create({
      data: {
        id: ids.otherCustomer,
        name: 'Other',
        email: 'other@example.com',
      },
    });
    await expect(
      gateway.book({
        ...commandAt('2099-07-14T08:00:00Z'),
        customerId: ids.otherCustomer,
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_CONFLICT' });
  });

  it.each([
    [
      'service bay',
      async () => prisma.serviceBay.updateMany({ data: { active: false } }),
    ],
    [
      'technician',
      async () => prisma.technician.updateMany({ data: { active: false } }),
    ],
    [
      'service type',
      async () => prisma.serviceType.updateMany({ data: { active: false } }),
    ],
  ])('does not allocate an inactive %s', async (_label, deactivate) => {
    await deactivate();
    await expect(
      gateway.book(commandAt('2099-07-14T08:00:00Z')),
    ).rejects.toMatchObject({
      code: 'RESOURCES_UNAVAILABLE',
    });
  });

  it('does not allocate a technician without the requested qualification', async () => {
    await prisma.technicianQualification.deleteMany();
    await expect(
      gateway.book(commandAt('2099-07-14T08:00:00Z')),
    ).rejects.toMatchObject({
      code: 'RESOURCES_UNAVAILABLE',
    });
  });

  it('does not allocate resources from another dealership', async () => {
    await prisma.dealership.create({
      data: { id: ids.otherDealership, name: 'Other', timezone: 'UTC' },
    });
    await expect(
      gateway.book({
        ...commandAt('2099-07-14T08:00:00Z'),
        dealershipId: ids.otherDealership,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCES_UNAVAILABLE' });
  });

  it.each([
    [
      'service bay',
      (first: { serviceBayId: string }) => ({
        vehicleId: ids.otherVehicle,
        serviceBayId: first.serviceBayId,
        technicianId: ids.technicianB,
      }),
    ],
    [
      'technician',
      (first: { technicianId: string }) => ({
        vehicleId: ids.otherVehicle,
        serviceBayId: ids.bayB,
        technicianId: first.technicianId,
      }),
    ],
    [
      'vehicle',
      () => ({
        vehicleId: ids.vehicle,
        serviceBayId: ids.bayB,
        technicianId: ids.technicianB,
      }),
    ],
  ])(
    'rejects an overlapping %s reservation at the database level',
    async (_label, conflictingAssignment) => {
      const first = await gateway.book(commandAt('2099-07-14T08:00:00Z'));

      // Bypass application guards to prove the database constraint.
      const caught = await prisma.appointment
        .create({
          data: {
            customerId: ids.customer,
            dealershipId: ids.dealership,
            serviceTypeId: ids.serviceType,
            ...conflictingAssignment(first),
            startTime: new Date('2099-07-14T08:30:00Z'),
            endTime: new Date('2099-07-14T09:30:00Z'),
          },
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(caught).toBeDefined();
      expect(isExclusionViolation(caught)).toBe(true);
      await expect(prisma.appointment.count()).resolves.toBe(1);
    },
  );

  it.each([
    [
      'vehicle reassignment',
      async (competing: Prisma.TransactionClient) => {
        await competing.vehicle.update({
          where: { id: ids.vehicle },
          data: { customerId: ids.otherCustomer },
        });
      },
    ],
    [
      'service type duration change',
      async (competing: Prisma.TransactionClient) => {
        await competing.serviceType.update({
          where: { id: ids.serviceType },
          data: { durationMinutes: 90, active: false },
        });
      },
    ],
  ])(
    'blocks a concurrent %s until the booking commits',
    async (_label, mutate) => {
      await prisma.customer.create({
        data: {
          id: ids.otherCustomer,
          name: 'Other',
          email: 'other@example.com',
        },
      });

      let mutationError: unknown;
      const lockedGateway = new PrismaAppointmentBookingGateway(prisma, {
        afterResourcesLocked: async () => {
          // The competing mutation must wait for the booking's share locks.
          mutationError = await prisma
            .$transaction(async (competing) => {
              await competing.$executeRaw`SET LOCAL lock_timeout = '250ms'`;
              await mutate(competing);
            })
            .then(
              () => undefined,
              (error: unknown) => error,
            );
        },
      });

      await expect(
        lockedGateway.book(commandAt('2099-07-14T08:00:00Z')),
      ).resolves.toMatchObject({
        customerId: ids.customer,
        endTime: new Date('2099-07-14T09:00:00Z'),
      });
      expect(isTransientFailure(mutationError)).toBe(true);
      await expect(prisma.$transaction(mutate)).resolves.toBeUndefined();
    },
  );

  it('blocks a concurrent qualification revocation until the booking commits', async () => {
    let revocationError: unknown;
    const lockedGateway = new PrismaAppointmentBookingGateway(prisma, {
      afterResourcesLocked: async () => {
        // Qualification revocation must wait for the booking's row locks.
        revocationError = await prisma
          .$transaction(async (competing) => {
            await competing.$executeRaw`SET LOCAL lock_timeout = '250ms'`;
            await competing.technicianQualification.delete({
              where: {
                technicianId_serviceTypeId: {
                  technicianId: ids.technicianA,
                  serviceTypeId: ids.serviceType,
                },
              },
            });
          })
          .then(
            () => undefined,
            (error: unknown) => error,
          );
      },
    });

    await expect(
      lockedGateway.book(commandAt('2099-07-14T08:00:00Z')),
    ).resolves.toMatchObject({ technicianId: ids.technicianA });
    expect(isTransientFailure(revocationError)).toBe(true);
    await expect(
      prisma.technicianQualification.count({
        where: { technicianId: ids.technicianA },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.technicianQualification.delete({
        where: {
          technicianId_serviceTypeId: {
            technicianId: ids.technicianA,
            serviceTypeId: ids.serviceType,
          },
        },
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.technicianQualification.count({
        where: { technicianId: ids.technicianA },
      }),
    ).resolves.toBe(0);
  });

  it('recognizes the real adapter error shape for a PostgreSQL lock timeout', async () => {
    let caught: unknown;

    await prisma.$transaction(async (holder) => {
      await holder.serviceBay.update({
        where: { id: ids.bayA },
        data: { name: 'Bay A held' },
      });
      caught = await prisma
        .$transaction(async (competing) => {
          await competing.$executeRaw`SET LOCAL lock_timeout = '100ms'`;
          await competing.serviceBay.update({
            where: { id: ids.bayA },
            data: { name: 'Bay A blocked' },
          });
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );
    });

    expect(caught).toBeDefined();
    expect(isTransientFailure(caught)).toBe(true);
  });

  it('recognizes the real Prisma interactive-transaction timeout shape', async () => {
    const caught = await prisma
      .$transaction(
        async (transaction) => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          await transaction.serviceBay.count();
        },
        { maxWait: 1_000, timeout: 100 },
      )
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(caught).toBeDefined();
    expect(isTransientFailure(caught)).toBe(true);
  });
});

function twoPartyBarrier(): Readonly<{ arrive: () => Promise<void> }> {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    arrive: async () => {
      arrivals += 1;
      if (arrivals === 2) release?.();
      await released;
    },
  };
}

function commandAt(startTime: string): CreateAppointmentCommand {
  return commandForVehicle(startTime, ids.vehicle);
}

function commandForVehicle(
  startTime: string,
  vehicleId: string,
): CreateAppointmentCommand {
  return {
    customerId: ids.customer,
    vehicleId,
    dealershipId: ids.dealership,
    serviceTypeId: ids.serviceType,
    startTime: new Date(startTime),
  };
}

async function seedAvailablePair(prisma: PrismaService): Promise<void> {
  await prisma.customer.create({
    data: { id: ids.customer, name: 'Customer', email: 'customer@example.com' },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      customerId: ids.customer,
      vin: 'VIN-1',
      make: 'Honda',
      model: 'Civic',
      year: 2024,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.thirdVehicle,
      customerId: ids.customer,
      vin: 'VIN-3',
      make: 'Toyota',
      model: 'Camry',
      year: 2025,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.otherVehicle,
      customerId: ids.customer,
      vin: 'VIN-2',
      make: 'Honda',
      model: 'Accord',
      year: 2025,
    },
  });
  await prisma.dealership.create({
    data: { id: ids.dealership, name: 'Central', timezone: 'UTC' },
  });
  await prisma.serviceType.create({
    data: { id: ids.serviceType, name: 'Oil change', durationMinutes: 60 },
  });
  await prisma.serviceBay.createMany({
    data: [
      { id: ids.bayB, dealershipId: ids.dealership, name: 'Bay B' },
      { id: ids.bayA, dealershipId: ids.dealership, name: 'Bay A' },
    ],
  });
  await prisma.technician.createMany({
    data: [
      { id: ids.technicianB, dealershipId: ids.dealership, name: 'Tech B' },
      { id: ids.technicianA, dealershipId: ids.dealership, name: 'Tech A' },
    ],
  });
  await prisma.technicianQualification.createMany({
    data: [
      { technicianId: ids.technicianA, serviceTypeId: ids.serviceType },
      { technicianId: ids.technicianB, serviceTypeId: ids.serviceType },
    ],
  });
}
