import { handleBootstrapFailure } from './common/observability/startup-failure';

describe('handleBootstrapFailure', () => {
  afterEach(() => {
    process.exitCode = undefined;
    jest.restoreAllMocks();
  });

  it('logs sanitized structured startup context and sets a failing exit code', () => {
    const write = jest.spyOn(process.stderr, 'write').mockReturnValue(true);

    handleBootstrapFailure(new Error('DATABASE_URL=postgres://user:secret@db'));

    expect(process.exitCode).toBe(1);
    expect(write).toHaveBeenCalledTimes(1);
    const record = JSON.parse(String(write.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >;
    expect(record).toMatchObject({
      level: 'fatal',
      event: 'application_startup_failed',
      context: 'bootstrap',
      errorName: 'Error',
    });
    expect(JSON.stringify(record)).not.toContain('secret');
    expect(JSON.stringify(record)).not.toContain('DATABASE_URL');
  });
});
