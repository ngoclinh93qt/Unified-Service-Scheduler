import { validate } from 'class-validator';

import { CreateAppointmentDto } from './create-appointment.dto';

describe('CreateAppointmentDto', () => {
  const dto = (startTime: string): CreateAppointmentDto =>
    Object.assign(new CreateAppointmentDto(), {
      customerId: '10000000-0000-4000-8000-000000000001',
      vehicleId: '20000000-0000-4000-8000-000000000001',
      dealershipId: '30000000-0000-4000-8000-000000000001',
      serviceTypeId: '40000000-0000-4000-8000-000000000001',
      startTime,
    });

  it.each(['2026-07-14', '2026-07-14T08:00:00.000'])(
    'rejects an instant without an explicit UTC designator or offset: %s',
    async (startTime) => {
      const errors = await validate(dto(startTime));

      expect(
        errors.find((error) => error.property === 'startTime'),
      ).toBeDefined();
    },
  );

  it.each(['2026-07-14T08:00:00.000Z', '2026-07-14T15:00:00.000+07:00'])(
    'accepts an instant with an explicit UTC designator or offset: %s',
    async (startTime) => {
      await expect(validate(dto(startTime))).resolves.toEqual([]);
    },
  );
});
