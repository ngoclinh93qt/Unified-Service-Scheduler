import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { ProblemDetailsFilter } from '../common/errors/problem-details.filter';
import { RequestIdMiddleware } from '../common/http/request-id.middleware';

export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(app.get(ProblemDetailsFilter));

  const requestIdMiddleware = app.get(RequestIdMiddleware);
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Service Scheduler API')
    .setDescription('Appointment scheduling service')
    .setVersion('1')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
}
