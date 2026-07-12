process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??=
  'postgresql://scheduler:scheduler@127.0.0.1:5432/service_scheduler?schema=public';
