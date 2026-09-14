import { plainToClass } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';

type Constructor<T> = new () => T;

/**
 * Transforms a plain object into a typed DTO instance and validates it.
 * Throws a standard Error with a descriptive message on validation failure.
 */
export async function validateDto<T extends object>(
  cls: Constructor<T>,
  plain: unknown,
): Promise<T> {
  const instance = plainToClass(cls, plain, {
    enableImplicitConversion: false,
    excludeExtraneousValues: false,
  });

  try {
    await validateOrReject(instance, {
      whitelist: true,
      skipMissingProperties: false,
    });
  } catch (errors) {
    if (Array.isArray(errors) && errors[0] instanceof ValidationError) {
      const messages = (errors as ValidationError[])
        .flatMap((e) => Object.values(e.constraints ?? {}))
        .join('; ');
      throw new Error(`DTO validation failed: ${messages}`);
    }
    throw errors;
  }

  return instance;
}
