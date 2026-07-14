import { PrismaService } from './prisma.service';

describe('PrismaService lifecycle', () => {
  it('disconnects when the Nest module is destroyed', async () => {
    const service = Object.create(PrismaService.prototype) as PrismaService;
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
