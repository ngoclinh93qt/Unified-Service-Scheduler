import { CreateAppointmentUseCase } from '../application/create-appointment.use-case';
import { AppointmentsController } from './appointments.controller';
import { CreateAppointmentDto } from './create-appointment.dto';

describe('AppointmentsController', () => {
  const ids = {
    customerId: '10000000-0000-4000-8000-000000000001',
    vehicleId: '20000000-0000-4000-8000-000000000001',
    dealershipId: '30000000-0000-4000-8000-000000000001',
    serviceTypeId: '40000000-0000-4000-8000-000000000001',
  } as const;
  const dto: CreateAppointmentDto = {
    ...ids,
    startTime: '2026-07-14T08:00:00.000Z',
  };
  const bookedAppointment = {
    id: '70000000-0000-4000-8000-000000000001',
    ...ids,
    serviceBayId: '50000000-0000-4000-8000-000000000001',
    technicianId: '60000000-0000-4000-8000-000000000001',
    startTime: new Date('2026-07-14T08:00:00.000Z'),
    endTime: new Date('2026-07-14T09:00:00.000Z'),
    status: 'CONFIRMED' as const,
  };
  const execute = jest.fn();
  const useCase = { execute } as unknown as CreateAppointmentUseCase;
  const controller = new AppointmentsController(useCase);

  beforeEach(() => execute.mockReset());

  it('parses the ISO instant and returns the stable response shape', async () => {
    execute.mockResolvedValue(bookedAppointment);

    await expect(controller.create(dto)).resolves.toEqual({
      ...bookedAppointment,
      startTime: '2026-07-14T08:00:00.000Z',
      endTime: '2026-07-14T09:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledWith({
      ...ids,
      startTime: new Date('2026-07-14T08:00:00.000Z'),
    });
  });
});
