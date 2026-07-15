import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ProblemDetailsResponse,
  ValidationProblemDetailsResponse,
} from '../../../common/errors/problem-details.response';

import { CreateAppointmentUseCase } from '../application/create-appointment.use-case';
import { GetAppointmentUseCase } from '../application/get-appointment.use-case';
import { AppointmentResponse } from './appointment.response';
import { CreateAppointmentDto } from './create-appointment.dto';

const APPOINTMENTS_PATH = '/api/v1/appointments';

@ApiTags('appointments')
@ApiExtraModels(ProblemDetailsResponse, ValidationProblemDetailsResponse)
@Controller({ path: 'appointments', version: '1' })
export class AppointmentsController {
  constructor(
    private readonly createAppointment: CreateAppointmentUseCase,
    private readonly getAppointment: GetAppointmentUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Book an appointment' })
  @ApiCreatedResponse({
    type: AppointmentResponse,
    headers: {
      Location: {
        description: 'Path of the created appointment',
        schema: { type: 'string' },
      },
    },
  })
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
  @ApiServiceUnavailableResponse({
    description:
      'Transient contention (deadlock or lock/transaction timeout); the request may be retried',
    content: problemContent(ProblemDetailsResponse),
    headers: {
      'Retry-After': {
        description: 'Seconds to wait before retrying',
        schema: { type: 'string' },
      },
    },
  })
  async create(
    @Body() dto: CreateAppointmentDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AppointmentResponse> {
    const appointment = await this.createAppointment.execute({
      customerId: dto.customerId,
      vehicleId: dto.vehicleId,
      dealershipId: dto.dealershipId,
      serviceTypeId: dto.serviceTypeId,
      startTime: new Date(dto.startTime),
    });

    response.setHeader('Location', `${APPOINTMENTS_PATH}/${appointment.id}`);
    return AppointmentResponse.from(appointment);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a confirmed appointment' })
  @ApiOkResponse({ type: AppointmentResponse })
  @ApiBadRequestResponse({
    description: 'Malformed appointment id',
    content: problemContent(ValidationProblemDetailsResponse),
  })
  @ApiNotFoundResponse({
    description: 'Appointment not found',
    content: problemContent(ProblemDetailsResponse),
  })
  async findOne(
    // Reuse the DTO validation error shape.
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new BadRequestException(['id must be a UUID']),
      }),
    )
    id: string,
  ): Promise<AppointmentResponse> {
    return AppointmentResponse.from(await this.getAppointment.execute(id));
  }
}

function problemContent(
  model: typeof ProblemDetailsResponse,
): Record<string, { schema: { $ref: string } }> {
  return {
    'application/problem+json': { schema: { $ref: getSchemaPath(model) } },
  };
}
