import { PrismaClient } from '@prisma/client';

export const seedIds = {
  customer: '10000000-0000-4000-8000-000000000001',
  vehicle: '20000000-0000-4000-8000-000000000001',
  dealership: '30000000-0000-4000-8000-000000000001',
  oilChange: '40000000-0000-4000-8000-000000000001',
  bayOne: '50000000-0000-4000-8000-000000000001',
  bayTwo: '50000000-0000-4000-8000-000000000002',
  technician: '60000000-0000-4000-8000-000000000001',
} as const;

type SeedOptions = Readonly<{ resetAppointments: boolean }>;

export async function seedDemoData(
  prisma: PrismaClient,
  options: SeedOptions,
): Promise<void> {
  if (options.resetAppointments) {
    await prisma.appointment.deleteMany({
      where: { vehicleId: seedIds.vehicle },
    });
  }

  await prisma.customer.upsert({
    where: { id: seedIds.customer },
    update: {
      name: 'Alex Morgan',
      email: 'alex@example.com',
      phone: '+1555010100',
    },
    create: {
      id: seedIds.customer,
      name: 'Alex Morgan',
      email: 'alex@example.com',
      phone: '+1555010100',
    },
  });
  await prisma.vehicle.upsert({
    where: { id: seedIds.vehicle },
    update: {
      customerId: seedIds.customer,
      vin: '1HGBH41JXMN109186',
      make: 'Honda',
      model: 'Civic',
      year: 2024,
    },
    create: {
      id: seedIds.vehicle,
      customerId: seedIds.customer,
      vin: '1HGBH41JXMN109186',
      make: 'Honda',
      model: 'Civic',
      year: 2024,
    },
  });
  await prisma.dealership.upsert({
    where: { id: seedIds.dealership },
    update: { name: 'UTC Service Centre', timezone: 'UTC' },
    create: {
      id: seedIds.dealership,
      name: 'UTC Service Centre',
      timezone: 'UTC',
    },
  });
  await prisma.serviceType.upsert({
    where: { id: seedIds.oilChange },
    update: { name: 'Oil Change', durationMinutes: 60, active: true },
    create: {
      id: seedIds.oilChange,
      name: 'Oil Change',
      durationMinutes: 60,
      active: true,
    },
  });
  for (const [id, name] of [
    [seedIds.bayOne, 'Bay 1'],
    [seedIds.bayTwo, 'Bay 2'],
  ] as const) {
    await prisma.serviceBay.upsert({
      where: { id },
      update: { dealershipId: seedIds.dealership, name, active: true },
      create: { id, dealershipId: seedIds.dealership, name, active: true },
    });
  }
  await prisma.technician.upsert({
    where: { id: seedIds.technician },
    update: {
      dealershipId: seedIds.dealership,
      name: 'Jordan Lee',
      active: true,
    },
    create: {
      id: seedIds.technician,
      dealershipId: seedIds.dealership,
      name: 'Jordan Lee',
      active: true,
    },
  });
  await prisma.technicianQualification.upsert({
    where: {
      technicianId_serviceTypeId: {
        technicianId: seedIds.technician,
        serviceTypeId: seedIds.oilChange,
      },
    },
    update: {},
    create: {
      technicianId: seedIds.technician,
      serviceTypeId: seedIds.oilChange,
    },
  });
}
