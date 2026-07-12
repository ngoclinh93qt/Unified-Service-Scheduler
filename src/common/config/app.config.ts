import Joi from 'joi';

const postgresUrl = Joi.string()
  .uri({ scheme: ['postgres', 'postgresql'] })
  .required();

export const appConfigValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  DATABASE_URL: postgresUrl,
});
