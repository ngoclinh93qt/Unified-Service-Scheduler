import { ApiProperty } from '@nestjs/swagger';

export class ValidationIssueResponse {
  @ApiProperty({ example: 'startTime' })
  field!: string;

  @ApiProperty({
    example: 'startTime must include Z or an explicit UTC offset',
  })
  message!: string;
}

export class ProblemDetailsResponse {
  @ApiProperty({ example: 'urn:service-scheduler:problem:reference-not-found' })
  type!: string;

  @ApiProperty({ example: 'Not Found' })
  title!: string;

  @ApiProperty({ example: 404 })
  status!: number;

  @ApiProperty({ example: 'Service type not found' })
  detail!: string;

  @ApiProperty({ example: '/api/v1/appointments' })
  instance!: string;

  @ApiProperty({ example: 'REFERENCE_NOT_FOUND' })
  code!: string;

  @ApiProperty({ example: '2026-07-13T08:00:00.000Z', format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ example: '8d6e6627-9671-43c4-80bb-dc69b18ab642' })
  requestId!: string;
}

export class ValidationProblemDetailsResponse extends ProblemDetailsResponse {
  @ApiProperty({ type: [ValidationIssueResponse] })
  errors!: ValidationIssueResponse[];
}
