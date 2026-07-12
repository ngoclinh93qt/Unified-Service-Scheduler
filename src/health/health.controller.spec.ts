import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const controller = new HealthController(prisma);

  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('reports liveness without querying the database', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('reports readiness after a database probe', async () => {
    queryRaw.mockResolvedValue([{ ok: 1 }]);

    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable without exposing a database failure', async () => {
    queryRaw.mockRejectedValue(new Error('password authentication failed'));

    await expect(controller.ready()).rejects.toEqual(
      new ServiceUnavailableException('Service is not ready'),
    );
  });
});
