import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../../src/app/app.module';
import { configureApp } from '../../src/app/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import {
  PostgresTestEnvironment,
  startPostgresTestEnvironment,
} from '../helpers/postgres-test-environment';

const ids = {
  customer: '10000000-0000-4000-8000-000000000001',
  otherCustomer: '10000000-0000-4000-8000-000000000002',
  vehicle: '20000000-0000-4000-8000-000000000001',
  dealership: '30000000-0000-4000-8000-000000000001',
  serviceType: '40000000-0000-4000-8000-000000000001',
  missingServiceType: '40000000-0000-4000-8000-000000000099',
  bay: '50000000-0000-4000-8000-000000000001',
  technician: '60000000-0000-4000-8000-000000000001',
} as const;

const validRequest = {
  customerId: ids.customer,
  vehicleId: ids.vehicle,
  dealershipId: ids.dealership,
  serviceTypeId: ids.serviceType,
  startTime: '2026-07-14T08:00:00.000Z',
};

describe('public API (e2e)', () => {
  let environment: PostgresTestEnvironment;
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    environment = await startPostgresTestEnvironment();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
    await environment?.stop();
  });

  beforeEach(async () => {
    await clearDatabase(prisma);
    await seedBookableAppointment(prisma);
  });

  it('creates an appointment with the public response and correlation contracts', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('x-request-id', 'e2e-request-1')
      .send(validRequest)
      .expect(201)
      .expect('x-request-id', 'e2e-request-1')
      .expect((response) => {
        const body = response.body as Record<string, unknown>;
        expect(body).toMatchObject({ status: 'CONFIRMED', ...validRequest });
        expect(body.serviceBayId).toEqual(expect.any(String));
        expect(body.technicianId).toEqual(expect.any(String));
      });
  });

  it('returns problem details for unknown request fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('x-request-id', 'validation-request')
      .send({ ...validRequest, unexpected: true })
      .expect(400)
      .expect('content-type', /application\/problem\+json/)
      .expect((response) => {
        const body = response.body as Record<string, unknown>;
        expect(body).toMatchObject({
          status: 400,
          code: 'VALIDATION_ERROR',
          requestId: 'validation-request',
          instance: '/api/v1/appointments',
        });
        expect(body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: 'property unexpected should not exist',
            }),
          ]),
        );
      });
  });

  it('returns 404 problem details for a missing service type', async () => {
    await expectProblem(
      request(app.getHttpServer())
        .post('/api/v1/appointments')
        .send({ ...validRequest, serviceTypeId: ids.missingServiceType }),
      404,
      'REFERENCE_NOT_FOUND',
    );
  });

  it('returns 409 problem details for a vehicle ownership mismatch', async () => {
    await expectProblem(
      request(app.getHttpServer())
        .post('/api/v1/appointments')
        .send({ ...validRequest, customerId: ids.otherCustomer }),
      409,
      'REFERENCE_CONFLICT',
    );
  });

  it('returns 409 problem details when resources are exhausted', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(validRequest)
      .expect(201);

    await expectProblem(
      request(app.getHttpServer())
        .post('/api/v1/appointments')
        .send(validRequest),
      409,
      'RESOURCES_UNAVAILABLE',
    );
  });

  it('keeps liveness independent of database readiness', async () => {
    const query = jest
      .spyOn(prisma, '$queryRaw')
      .mockRejectedValueOnce(new Error('offline'));

    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200, {
      status: 'ok',
    });
    await expectProblem(
      request(app.getHttpServer()).get('/api/v1/health/ready'),
      503,
      'SERVICE_UNAVAILABLE',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('publishes the appointment operation in OpenAPI', async () => {
    await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200)
      .expect((response) => {
        const body = response.body as Record<string, unknown>;
        expect(body.paths).toHaveProperty('/api/v1/appointments');
      });
  });
});

async function expectProblem(
  pending: request.Test,
  status: number,
  code: string,
): Promise<void> {
  await pending
    .expect(status)
    .expect('content-type', /application\/problem\+json/)
    .expect((response) => {
      const body = response.body as Record<string, unknown>;
      expect(body).toMatchObject({ status, code });
      expect(body.type).toBe(
        `urn:service-scheduler:problem:${code.toLowerCase().replaceAll('_', '-')}`,
      );
      expect(body.requestId).toEqual(expect.any(String));
      expect(body.timestamp).toEqual(expect.any(String));
    });
}

async function clearDatabase(prisma: PrismaService): Promise<void> {
  await prisma.appointment.deleteMany();
  await prisma.technicianQualification.deleteMany();
  await prisma.technician.deleteMany();
  await prisma.serviceBay.deleteMany();
  await prisma.serviceType.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.dealership.deleteMany();
}

async function seedBookableAppointment(prisma: PrismaService): Promise<void> {
  await prisma.customer.createMany({
    data: [
      { id: ids.customer, name: 'Customer', email: 'customer@example.com' },
      { id: ids.otherCustomer, name: 'Other', email: 'other@example.com' },
    ],
  });
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      customerId: ids.customer,
      vin: 'E2E-VIN-1',
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
  await prisma.serviceBay.create({
    data: { id: ids.bay, dealershipId: ids.dealership, name: 'Bay 1' },
  });
  await prisma.technician.create({
    data: { id: ids.technician, dealershipId: ids.dealership, name: 'Tech 1' },
  });
  await prisma.technicianQualification.create({
    data: { technicianId: ids.technician, serviceTypeId: ids.serviceType },
  });
}
