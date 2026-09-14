import { ApiProperty } from '@nestjs/swagger';

/** Public HTTP response contract for GET /cep/:cep */
export class CepResponseDto {
  @ApiProperty({ example: '55200-000' })
  cep: string;

  @ApiProperty({ example: 'Praça Mestre Dominguinhos' })
  street: string;

  @ApiProperty({ example: 'Centro' })
  neighborhood: string;

  @ApiProperty({ example: 'Garanhuns' })
  city: string;

  @ApiProperty({ example: 'PE' })
  state: string;
}
