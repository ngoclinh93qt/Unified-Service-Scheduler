import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOperation,
  ApiExtraModels,
  ApiServiceUnavailableResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ProblemDetailsResponse } from '../common/errors/problem-details.response';
import { PrismaService } from '../database/prisma.service';

@ApiTags('health')
@ApiExtraModels(ProblemDetailsResponse)
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOperation({ summary: 'Report process liveness' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Report database readiness' })
  @ApiServiceUnavailableResponse({
    description: 'Database is unavailable',
    content: {
      'application/problem+json': {
        schema: { $ref: getSchemaPath(ProblemDetailsResponse) },
      },
    },
  })
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1 AS ok`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Service is not ready');
    }
  }
}
