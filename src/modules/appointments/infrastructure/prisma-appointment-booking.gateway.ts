import { Injectable } from '@nestjs/common';
import { Appointment, Prisma } from '@prisma/client';

import { ApplicationError } from '../../../common/errors/application.error';
import { PrismaService } from '../../../database/prisma.service';
import {
  AppointmentBookingGateway,
  BookedAppointment,
  CreateAppointmentCommand,
} from '../application/booking.types';
import { AppointmentInterval } from '../domain/appointment-interval';

type Candidate = Readonly<{ id: string }>;

@Injectable()
export class PrismaAppointmentBookingGateway implements AppointmentBookingGateway {
  constructor(private readonly prisma: PrismaService) {}

  async book(command: CreateAppointmentCommand): Promise<BookedAppointment> {
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({
        where: { id: command.customerId },
      });
      const vehicle = await transaction.vehicle.findUnique({
        where: { id: command.vehicleId },
      });
      const dealership = await transaction.dealership.findUnique({
        where: { id: command.dealershipId },
      });
      const serviceType = await transaction.serviceType.findUnique({
        where: { id: command.serviceTypeId },
      });

      if (!customer) throw referenceNotFound('Customer');
      if (!vehicle) throw referenceNotFound('Vehicle');
      if (!dealership) throw referenceNotFound('Dealership');
      if (!serviceType) throw referenceNotFound('Service type');
      if (vehicle.customerId !== customer.id) {
        throw new ApplicationError(
          'REFERENCE_CONFLICT',
          'Vehicle does not belong to the customer',
        );
      }
      if (!serviceType.active) throw resourcesUnavailable();

      const interval = AppointmentInterval.create(
        command.startTime,
        serviceType.durationMinutes,
      );
      const bays = await transaction.$queryRaw<Candidate[]>(Prisma.sql`
        SELECT b.id
        FROM service_bays b
        WHERE b.dealership_id = ${dealership.id}::uuid
          AND b.active = true
          AND NOT EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.service_bay_id = b.id
              AND a.start_time < ${interval.end}
              AND a.end_time > ${interval.start}
              AND a.status = 'CONFIRMED'
          )
        ORDER BY b.id
        FOR UPDATE
      `);
      const serviceBay = bays[0];
      if (!serviceBay) throw resourcesUnavailable();

      const technicians = await transaction.$queryRaw<Candidate[]>(Prisma.sql`
        SELECT t.id
        FROM technicians t
        INNER JOIN technician_qualifications q ON q.technician_id = t.id
        WHERE t.dealership_id = ${dealership.id}::uuid
          AND t.active = true
          AND q.service_type_id = ${serviceType.id}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.technician_id = t.id
              AND a.start_time < ${interval.end}
              AND a.end_time > ${interval.start}
              AND a.status = 'CONFIRMED'
          )
        ORDER BY t.id
        FOR UPDATE OF t
      `);
      const technician = technicians[0];
      if (!technician) throw resourcesUnavailable();

      const appointment = await transaction.appointment.create({
        data: {
          customerId: customer.id,
          vehicleId: vehicle.id,
          dealershipId: dealership.id,
          serviceTypeId: serviceType.id,
          serviceBayId: serviceBay.id,
          technicianId: technician.id,
          startTime: interval.start,
          endTime: interval.end,
        },
      });
      return toBookedAppointment(appointment);
    });
  }
}

function referenceNotFound(reference: string): ApplicationError {
  return new ApplicationError('REFERENCE_NOT_FOUND', `${reference} not found`);
}

function resourcesUnavailable(): ApplicationError {
  return new ApplicationError(
    'RESOURCES_UNAVAILABLE',
    'No service bay and qualified technician are available',
  );
}

function toBookedAppointment(appointment: Appointment): BookedAppointment {
  return {
    id: appointment.id,
    customerId: appointment.customerId,
    vehicleId: appointment.vehicleId,
    dealershipId: appointment.dealershipId,
    serviceTypeId: appointment.serviceTypeId,
    serviceBayId: appointment.serviceBayId,
    technicianId: appointment.technicianId,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: appointment.status,
  };
}
