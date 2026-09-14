import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiBadRequestResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CepParamDto } from '../dto/cep-param.dto';
import { CepResponseDto } from '../dto/cep-response.dto';
import { CepService } from '../services/cep.service';

@ApiTags('CEP')
@Controller('cep')
export class CepController {
  constructor(private readonly cepService: CepService) {}

  @Get(':cep')
  @ApiOperation({ summary: 'Consulta dados de um CEP' })
  @ApiParam({
    name: 'cep',
    description: 'CEP com ou sem traço (ex: 55200000 ou 55200-000)',
    example: '55200000',
  })
  @ApiOkResponse({ type: CepResponseDto, description: 'CEP encontrado' })
  @ApiBadRequestResponse({ description: 'CEP inválido (formato incorreto)' })
  @ApiNotFoundResponse({ description: 'CEP não encontrado' })
  @ApiServiceUnavailableResponse({
    description: 'Providers temporariamente indisponíveis',
  })
  async getCep(@Param() params: CepParamDto): Promise<CepResponseDto> {
    const result = await this.cepService.getCep(params.cep);

    return {
      cep: result.cep,
      street: result.street,
      neighborhood: result.neighborhood,
      city: result.city,
      state: result.state,
    };
  }
}
