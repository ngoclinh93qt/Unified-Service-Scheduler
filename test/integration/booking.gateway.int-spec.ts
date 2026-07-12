import { PrismaService } from '../../src/database/prisma.service';
import { CreateAppointmentCommand } from '../../src/modules/appointments/application/booking.types';
import { PrismaAppointmentBookingGateway } from '../../src/modules/appointments/infrastructure/prisma-appointment-booking.gateway';
import {
  PostgresTestEnvironment,
  startPostgresTestEnvironment,
} from '../helpers/postgres-test-environment';

const ids = {
  customer: '10000000-0000-4000-8000-000000000001',
  otherCustomer: '10000000-0000-4000-8000-000000000002',
  vehicle: '20000000-0000-4000-8000-000000000001',
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
    const result = await gateway.book(commandAt('2026-07-14T08:00:00Z'));
    expect(result.serviceBayId).toBe(ids.bayA);
    expect(result.technicianId).toBe(ids.technicianA);
    await expect(prisma.appointment.count()).resolves.toBe(1);
  });

  it('allows a booking that starts exactly when another ends', async () => {
    await gateway.book(commandAt('2026-07-14T08:00:00Z'));
    await expect(
      gateway.book(commandAt('2026-07-14T09:00:00Z')),
    ).resolves.toMatchObject({ startTime: new Date('2026-07-14T09:00:00Z') });
  });

  it('uses another pair when the first pair overlaps', async () => {
    await gateway.book(commandAt('2026-07-14T08:00:00Z'));
    const second = await gateway.book(commandAt('2026-07-14T08:30:00Z'));
    expect(second.serviceBayId).toBe(ids.bayB);
    expect(second.technicianId).toBe(ids.technicianB);
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
    const first = competingGateway.book(commandAt('2026-07-14T08:00:00Z'));
    const second = competingGateway.book(commandAt('2026-07-14T08:00:00Z'));

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

  it('rolls back and reports unavailable when no full pair exists', async () => {
    await gateway.book(commandAt('2026-07-14T08:00:00Z'));
    await gateway.book(commandAt('2026-07-14T08:00:00Z'));
    await expect(
      gateway.book(commandAt('2026-07-14T08:30:00Z')),
    ).rejects.toMatchObject({
      code: 'RESOURCES_UNAVAILABLE',
    });
    await expect(prisma.appointment.count()).resolves.toBe(2);
  });

  it('reports a missing service type before allocation', async () => {
    await expect(
      gateway.book({
        ...commandAt('2026-07-14T08:00:00Z'),
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
        ...commandAt('2026-07-14T08:00:00Z'),
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
      gateway.book(commandAt('2026-07-14T08:00:00Z')),
    ).rejects.toMatchObject({
      code: 'RESOURCES_UNAVAILABLE',
    });
  });

  it('does not allocate a technician without the requested qualification', async () => {
    await prisma.technicianQualification.deleteMany();
    await expect(
      gateway.book(commandAt('2026-07-14T08:00:00Z')),
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
        ...commandAt('2026-07-14T08:00:00Z'),
        dealershipId: ids.otherDealership,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCES_UNAVAILABLE' });
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
  return {
    customerId: ids.customer,
    vehicleId: ids.vehicle,
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
