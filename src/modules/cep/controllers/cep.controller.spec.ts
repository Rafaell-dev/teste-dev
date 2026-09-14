import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { CepController } from './cep.controller';
import { CepService } from '../services/cep.service';
import { CepExceptionFilter } from '../filters/cep-exception.filter';
import { CepNotFoundException } from '../exceptions/cep-not-found.exception';
import { ProvidersUnavailableException } from '../exceptions/providers-unavailable.exception';

const mockCepService = {
  getCep: jest.fn(),
};

describe('CepController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CepController],
      providers: [{ provide: CepService, useValue: mockCepService }],
    }).compile();

    app = module.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new CepExceptionFilter());

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /cep/55200000 → 200 with correct body', async () => {
    mockCepService.getCep.mockResolvedValue({
      cep: '55200-000',
      street: 'Praça Mestre Dominguinhos',
      neighborhood: 'Centro',
      city: 'Garanhuns',
      state: 'PE',
    });

    const response = await request(app.getHttpServer()).get('/cep/55200000');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      cep: '55200-000',
      street: expect.any(String),
      neighborhood: expect.any(String),
      city: 'Garanhuns',
      state: 'PE',
    });
  });

  it('GET /cep/55200-000 → 200 (accepts formatted CEP)', async () => {
    mockCepService.getCep.mockResolvedValue({
      cep: '55200-000',
      street: '',
      neighborhood: '',
      city: 'Garanhuns',
      state: 'PE',
    });

    const response = await request(app.getHttpServer()).get('/cep/55200-000');

    expect(response.status).toBe(200);
  });

  it('GET /cep/123 → 400 (invalid CEP format)', async () => {
    const response = await request(app.getHttpServer()).get('/cep/123');

    expect(response.status).toBe(400);
  });

  it('GET /cep/abcdefgh → 400 (non-numeric CEP)', async () => {
    const response = await request(app.getHttpServer()).get('/cep/abcdefgh');

    expect(response.status).toBe(400);
  });

  it('GET /cep/00000000 → 404 when service throws CepNotFoundException', async () => {
    mockCepService.getCep.mockRejectedValue(
      new CepNotFoundException('00000000'),
    );

    const response = await request(app.getHttpServer()).get('/cep/00000000');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'CEP_NOT_FOUND',
    });
  });

  it('GET /cep/55200000 → 503 when service throws ProvidersUnavailableException', async () => {
    mockCepService.getCep.mockRejectedValue(
      new ProvidersUnavailableException(),
    );

    const response = await request(app.getHttpServer()).get('/cep/55200000');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'PROVIDERS_UNAVAILABLE',
    });
  });
});
