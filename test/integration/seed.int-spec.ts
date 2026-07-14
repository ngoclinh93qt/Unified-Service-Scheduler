import { seedDemoData, seedIds } from '../../prisma/seed-data';
import { PrismaService } from '../../src/database/prisma.service';
import {
  PostgresTestEnvironment,
  startPostgresTestEnvironment,
} from '../helpers/postgres-test-environment';

const otherIds = {
  customer: '10000000-0000-4000-8000-000000000099',
  vehicle: '20000000-0000-4000-8000-000000000099',
} as const;

describe('assessment seed', () => {
  let environment: PostgresTestEnvironment;
  let prisma: PrismaService;

  beforeAll(async () => {
    environment = await startPostgresTestEnvironment();
    prisma = environment.prisma;
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
  });

  it('resets only seed-vehicle appointments when explicitly enabled', async () => {
    await seedDemoData(prisma, { resetAppointments: false });
    await prisma.customer.create({
      data: {
        id: otherIds.customer,
        name: 'Other customer',
        email: 'other-seed@example.com',
      },
    });
    await prisma.vehicle.create({
      data: {
        id: otherIds.vehicle,
        customerId: otherIds.customer,
        vin: 'OTHER-DEMO-VIN',
        make: 'Toyota',
        model: 'Corolla',
        year: 2025,
      },
    });
    await createAppointment(prisma, seedIds.vehicle, seedIds.customer, 15);
    await createAppointment(prisma, otherIds.vehicle, otherIds.customer, 16);

    await seedDemoData(prisma, { resetAppointments: false });
    await expect(prisma.appointment.count()).resolves.toBe(2);

    await seedDemoData(prisma, { resetAppointments: true });
    await expect(
      prisma.appointment.count({ where: { vehicleId: seedIds.vehicle } }),
    ).resolves.toBe(0);
    await expect(
      prisma.appointment.count({ where: { vehicleId: otherIds.vehicle } }),
    ).resolves.toBe(1);
  });
});

async function createAppointment(
  prisma: PrismaService,
  vehicleId: string,
  customerId: string,
  day: number,
): Promise<void> {
  await prisma.appointment.create({
    data: {
      customerId,
      vehicleId,
      dealershipId: seedIds.dealership,
      serviceTypeId: seedIds.oilChange,
      serviceBayId: seedIds.bayOne,
      technicianId: seedIds.technician,
      startTime: new Date(`2030-01-${day}T10:00:00.000Z`),
      endTime: new Date(`2030-01-${day}T11:00:00.000Z`),
    },
  });
}
