import { ApplicationError } from '../../../common/errors/application.error';
import {
  type BookedAppointment,
  type CreateAppointmentCommand,
} from './booking.types';
import { CreateAppointmentUseCase } from './create-appointment.use-case';

describe('CreateAppointmentUseCase', () => {
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

  it('delegates one immutable command to the authoritative gateway', async () => {
    const gateway = {
      book: jest.fn().mockResolvedValue(bookedAppointment),
    };
    const useCase = new CreateAppointmentUseCase(gateway);

    await expect(useCase.execute(command)).resolves.toEqual(bookedAppointment);
    expect(gateway.book).toHaveBeenCalledWith(command);
    expect(gateway.book).toHaveBeenCalledTimes(1);
  });

  it('preserves application errors from the authoritative gateway', async () => {
    const error = new ApplicationError(
      'RESOURCES_UNAVAILABLE',
      'No resources are available',
    );
    const gateway = { book: jest.fn().mockRejectedValue(error) };
    const useCase = new CreateAppointmentUseCase(gateway);

    await expect(useCase.execute(command)).rejects.toBe(error);
  });
});
