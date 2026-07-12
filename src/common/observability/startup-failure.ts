export function handleBootstrapFailure(error: unknown): void {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  process.stderr.write(
    `${JSON.stringify({
      level: 'fatal',
      event: 'application_startup_failed',
      context: 'bootstrap',
      errorName,
    })}\n`,
  );
  process.exitCode = 1;
}
