import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for a successful ViaCEP response.
 *
 * The error case {"erro": true} is handled before this validation is run —
 * see ViaCepProvider.getCep(). All string fields can be empty strings for
 * CEPs in small towns that lack street-level data.
 */
export class ViaCepResponseDto {
  @IsString()
  @IsNotEmpty()
  cep: string;

  @IsString()
  logradouro: string;

  @IsString()
  complemento: string;

  @IsString()
  bairro: string;

  @IsString()
  @IsNotEmpty()
  localidade: string;

  @IsString()
  @IsNotEmpty()
  uf: string;

  @IsOptional()
  @IsString()
  ibge?: string;

  @IsOptional()
  @IsString()
  ddd?: string;
}
