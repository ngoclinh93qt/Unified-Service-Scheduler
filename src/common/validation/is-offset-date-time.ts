import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:\d{2})$/;

export function IsOffsetDateTime(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isOffsetDateTime',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && OFFSET_SUFFIX.test(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must include Z or an explicit UTC offset`;
        },
      },
    });
  };
}
