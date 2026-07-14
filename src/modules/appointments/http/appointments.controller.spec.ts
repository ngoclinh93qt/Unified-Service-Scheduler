import { Response } from 'express';

import { CreateAppointmentUseCase } from '../application/create-appointment.use-case';
import { GetAppointmentUseCase } from '../application/get-appointment.use-case';
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
  const findOne = jest.fn();
  const createUseCase = { execute } as unknown as CreateAppointmentUseCase;
  const getUseCase = {
    execute: findOne,
  } as unknown as GetAppointmentUseCase;
  const controller = new AppointmentsController(createUseCase, getUseCase);

  function fakeResponse(): {
    response: Response;
    headers: Record<string, string>;
  } {
    const headers: Record<string, string> = {};
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response;
    return { response, headers };
  }

  beforeEach(() => {
    execute.mockReset();
    findOne.mockReset();
  });

  it('parses the ISO instant, sets Location, and returns the stable shape', async () => {
    execute.mockResolvedValue(bookedAppointment);
    const { response, headers } = fakeResponse();

    await expect(controller.create(dto, response)).resolves.toEqual({
      ...bookedAppointment,
      startTime: '2026-07-14T08:00:00.000Z',
      endTime: '2026-07-14T09:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledWith({
      ...ids,
      startTime: new Date('2026-07-14T08:00:00.000Z'),
    });
    expect(headers.Location).toBe(
      '/api/v1/appointments/70000000-0000-4000-8000-000000000001',
    );
  });

  it('returns the stable response shape for a read by id', async () => {
    findOne.mockResolvedValue(bookedAppointment);

    await expect(controller.findOne(bookedAppointment.id)).resolves.toEqual({
      ...bookedAppointment,
      startTime: '2026-07-14T08:00:00.000Z',
      endTime: '2026-07-14T09:00:00.000Z',
    });
    expect(findOne).toHaveBeenCalledWith(bookedAppointment.id);
  });
});
