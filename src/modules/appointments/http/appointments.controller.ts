import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CreateAppointmentUseCase } from '../application/create-appointment.use-case';
import { AppointmentResponse } from './appointment.response';
import { CreateAppointmentDto } from './create-appointment.dto';

@ApiTags('appointments')
@Controller({ path: 'appointments', version: '1' })
export class AppointmentsController {
  constructor(private readonly createAppointment: CreateAppointmentUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Book an appointment' })
  @ApiCreatedResponse({ type: AppointmentResponse })
  @ApiBadRequestResponse({ description: 'Invalid request' })
  @ApiNotFoundResponse({ description: 'Referenced entity not found' })
  @ApiConflictResponse({
    description: 'Reference conflict or unavailable resources',
  })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error' })
  async create(
    @Body() dto: CreateAppointmentDto,
  ): Promise<AppointmentResponse> {
    const appointment = await this.createAppointment.execute({
      customerId: dto.customerId,
      vehicleId: dto.vehicleId,
      dealershipId: dto.dealershipId,
      serviceTypeId: dto.serviceTypeId,
      startTime: new Date(dto.startTime),
    });

    return AppointmentResponse.from(appointment);
  }
}
