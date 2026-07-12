import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ProblemDetailsResponse,
  ValidationProblemDetailsResponse,
} from '../../../common/errors/problem-details.response';

import { CreateAppointmentUseCase } from '../application/create-appointment.use-case';
import { AppointmentResponse } from './appointment.response';
import { CreateAppointmentDto } from './create-appointment.dto';

@ApiTags('appointments')
@ApiExtraModels(ProblemDetailsResponse, ValidationProblemDetailsResponse)
@Controller({ path: 'appointments', version: '1' })
export class AppointmentsController {
  constructor(private readonly createAppointment: CreateAppointmentUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Book an appointment' })
  @ApiCreatedResponse({ type: AppointmentResponse })
  @ApiBadRequestResponse({
    description: 'Invalid request',
    content: problemContent(ValidationProblemDetailsResponse),
  })
  @ApiNotFoundResponse({
    description: 'Referenced entity not found',
    content: problemContent(ProblemDetailsResponse),
  })
  @ApiConflictResponse({
    description: 'Reference conflict or unavailable resources',
    content: problemContent(ProblemDetailsResponse),
  })
  @ApiInternalServerErrorResponse({
    description: 'Unexpected server error',
    content: problemContent(ProblemDetailsResponse),
  })
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

function problemContent(
  model: typeof ProblemDetailsResponse,
): Record<string, { schema: { $ref: string } }> {
  return {
    'application/problem+json': { schema: { $ref: getSchemaPath(model) } },
  };
}
