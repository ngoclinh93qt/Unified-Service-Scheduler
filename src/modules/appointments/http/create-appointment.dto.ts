import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID } from 'class-validator';
import { IsOffsetDateTime } from '../../../common/validation/is-offset-date-time';

export class CreateAppointmentDto {
  @ApiProperty({ example: '10000000-0000-4000-8000-000000000001' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ example: '20000000-0000-4000-8000-000000000001' })
  @IsUUID()
  vehicleId!: string;

  @ApiProperty({ example: '30000000-0000-4000-8000-000000000001' })
  @IsUUID()
  dealershipId!: string;

  @ApiProperty({ example: '40000000-0000-4000-8000-000000000001' })
  @IsUUID()
  serviceTypeId!: string;

  @ApiProperty({ example: '2026-07-14T08:00:00.000Z', format: 'date-time' })
  @IsISO8601({ strict: true })
  @IsOffsetDateTime()
  startTime!: string;
}
