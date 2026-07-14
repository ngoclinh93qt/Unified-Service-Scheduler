import { pinoHttpOptions } from './logger.config';

describe('HTTP logger configuration', () => {
  it('redacts credentials from serialized request headers', () => {
    expect(pinoHttpOptions.redact).toEqual({
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[Redacted]',
    });
  });
});
