export type CreateAppointmentCommand = Readonly<{
  customerId: string;
  vehicleId: string;
  dealershipId: string;
  serviceTypeId: string;
  startTime: Date;
}>;

export type BookedAppointment = Readonly<{
  id: string;
  customerId: string;
  vehicleId: string;
  dealershipId: string;
  serviceTypeId: string;
  serviceBayId: string;
  technicianId: string;
  startTime: Date;
  endTime: Date;
  status: 'CONFIRMED';
}>;

export interface AppointmentBookingGateway {
  book(command: CreateAppointmentCommand): Promise<BookedAppointment>;
}

export const APPOINTMENT_BOOKING_GATEWAY = Symbol(
  'APPOINTMENT_BOOKING_GATEWAY',
);
