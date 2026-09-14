import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for a successful BrasilAPI CEP response.
 *
 * BrasilAPI returns HTTP 404 for not-found CEPs, handled in the provider
 * before DTO validation. neighborhood and street are optional since some
 * CEPs represent entire cities or postal areas without street-level data.
 */
export class BrasilApiResponseDto {
  @IsString()
  @IsNotEmpty()
  cep: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  service?: string;
}
