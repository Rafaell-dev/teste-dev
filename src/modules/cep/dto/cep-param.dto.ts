import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

/**
 * Validates and normalizes the :cep route parameter.
 *
 * Accepted formats: "55200000" or "55200-000"
 * Rejected:         any string that does not yield exactly 8 digits
 *
 * The @Transform runs first (class-transformer), stripping non-digit characters.
 * @Matches then validates the normalized value must be exactly 8 digits.
 */
export class CepParamDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsString()
  @Matches(/^\d{8}$/, {
    message: 'CEP deve conter exatamente 8 dígitos numéricos',
  })
  cep: string;
}
