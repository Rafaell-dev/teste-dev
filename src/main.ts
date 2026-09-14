import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CepExceptionFilter } from './modules/cep/filters/cep-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  /**
   * Global validation pipe.
   * - transform: true   → class-transformer runs @Transform decorators (e.g. CEP normalisation)
   * - whitelist: true   → strips properties not declared in DTOs
   * - forbidNonWhitelisted: true → throws 400 if extra properties are present
   */
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  /**
   * Global exception filter for domain errors.
   * Maps CepNotFoundException → 404, ProvidersUnavailableException → 503.
   * Other exceptions fall through to NestJS's built-in handler.
   */
  app.useGlobalFilters(new CepExceptionFilter());

  // Swagger — available only outside production for security
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('CEP API')
      .setDescription(
        'API resiliente de consulta de CEP com Redis cache, BullMQ retry e múltiplos providers com fallback.',
      )
      .setVersion('1.0')
      .addTag('CEP')
      .addTag('Health')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT ?? '3000';
  await app.listen(port);
}

bootstrap();
