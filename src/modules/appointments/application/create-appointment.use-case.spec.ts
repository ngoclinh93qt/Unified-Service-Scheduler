import { PinoLogger } from 'nestjs-pino';

import { ApplicationError } from '../../../common/errors/application.error';
import {
  type BookedAppointment,
  type CreateAppointmentCommand,
} from './booking.types';
import { type Clock } from './clock';
import { CreateAppointmentUseCase } from './create-appointment.use-case';

describe('CreateAppointmentUseCase', () => {
  const fixedNow = new Date('2026-07-13T00:00:00.000Z');
  const clock: Clock = () => fixedNow;

  const command: CreateAppointmentCommand = Object.freeze({
    customerId: 'customer-1',
    vehicleId: 'vehicle-1',
    dealershipId: 'dealership-1',
    serviceTypeId: 'service-type-1',
    startTime: new Date('2026-07-13T08:00:00.000Z'),
  });

  const bookedAppointment: BookedAppointment = Object.freeze({
    id: 'appointment-1',
    ...command,
    serviceBayId: 'bay-1',
    technicianId: 'technician-1',
    endTime: new Date('2026-07-13T09:00:00.000Z'),
    status: 'CONFIRMED',
  });

  function fakeLogger(): {
    logger: PinoLogger;
    info: jest.Mock;
    warn: jest.Mock;
  } {
    const info = jest.fn();
    const warn = jest.fn();
    return { logger: { info, warn } as unknown as PinoLogger, info, warn };
  }

  it('delegates one immutable command and logs the confirmed outcome', async () => {
    const gateway = {
      book: jest.fn().mockResolvedValue(bookedAppointment),
      findById: jest.fn(),
    };
    const { logger, info } = fakeLogger();
    const useCase = new CreateAppointmentUseCase(gateway, clock, logger);

    await expect(useCase.execute(command)).resolves.toEqual(bookedAppointment);
    expect(gateway.book).toHaveBeenCalledWith(command);
    expect(gateway.book).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'booking_confirmed',
        appointmentId: bookedAppointment.id,
        dealershipId: command.dealershipId,
      }),
      'Booking confirmed',
    );
  });

  it.each([
    ['in the past', '2026-07-12T23:59:59.000Z'],
    ['exactly now', '2026-07-13T00:00:00.000Z'],
  ])(
    'rejects a start time %s before touching the gateway',
    async (_label, startTime) => {
      const gateway = { book: jest.fn(), findById: jest.fn() };
      const { logger, warn } = fakeLogger();
      const useCase = new CreateAppointmentUseCase(gateway, clock, logger);
      const pastCommand: CreateAppointmentCommand = {
        ...command,
        startTime: new Date(startTime),
      };

      await expect(useCase.execute(pastCommand)).rejects.toMatchObject({
        code: 'INVALID_APPOINTMENT_TIME',
      });
      expect(gateway.book).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'booking_rejected',
          code: 'INVALID_APPOINTMENT_TIME',
        }),
        'Booking rejected',
      );
    },
  );

  it('preserves application errors and logs the rejected outcome', async () => {
    const error = new ApplicationError(
      'RESOURCES_UNAVAILABLE',
      'No resources are available',
    );
    const gateway = {
      book: jest.fn().mockRejectedValue(error),
      findById: jest.fn(),
    };
    const { logger, warn } = fakeLogger();
    const useCase = new CreateAppointmentUseCase(gateway, clock, logger);

    await expect(useCase.execute(command)).rejects.toBe(error);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'booking_rejected',
        code: 'RESOURCES_UNAVAILABLE',
      }),
      'Booking rejected',
    );
  });
});
