import { type BookedAppointment } from './booking.types';
import { GetAppointmentUseCase } from './get-appointment.use-case';

describe('GetAppointmentUseCase', () => {
  const appointment: BookedAppointment = Object.freeze({
    id: '70000000-0000-4000-8000-000000000001',
    customerId: 'customer-1',
    vehicleId: 'vehicle-1',
    dealershipId: 'dealership-1',
    serviceTypeId: 'service-type-1',
    serviceBayId: 'bay-1',
    technicianId: 'technician-1',
    startTime: new Date('2026-07-14T08:00:00.000Z'),
    endTime: new Date('2026-07-14T09:00:00.000Z'),
    status: 'CONFIRMED',
  });

  it('returns the appointment when it exists', async () => {
    const gateway = {
      book: jest.fn(),
      findById: jest.fn().mockResolvedValue(appointment),
    };
    const useCase = new GetAppointmentUseCase(gateway);

    await expect(useCase.execute(appointment.id)).resolves.toEqual(appointment);
    expect(gateway.findById).toHaveBeenCalledWith(appointment.id);
  });

  it('raises a not-found application error when it is missing', async () => {
    const gateway = {
      book: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
    };
    const useCase = new GetAppointmentUseCase(gateway);

    await expect(useCase.execute('missing')).rejects.toMatchObject({
      code: 'REFERENCE_NOT_FOUND',
    });
  });
});
