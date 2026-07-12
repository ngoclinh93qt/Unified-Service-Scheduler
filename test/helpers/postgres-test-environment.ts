import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

import { PrismaService } from '../../src/database/prisma.service';

const execFileAsync = promisify(execFile);

export type PostgresTestEnvironment = Readonly<{
  databaseUrl: string;
  prisma: PrismaService;
  stop: () => Promise<void>;
}>;

export async function startPostgresTestEnvironment(): Promise<PostgresTestEnvironment> {
  process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';
  const container = await new GenericContainer(
    process.env.POSTGRES_TEST_IMAGE ?? 'postgres:17-alpine',
  )
    .withEnvironment({
      POSTGRES_DB: 'service_scheduler',
      POSTGRES_USER: 'scheduler',
      POSTGRES_PASSWORD: 'scheduler',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  const databaseUrl = connectionString(container);
  let prisma: PrismaService | undefined;

  try {
    await execFileAsync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    process.env.DATABASE_URL = databaseUrl;
    prisma = new PrismaService();
    await prisma.$connect();
  } catch (error) {
    await container.stop();
    throw error;
  }

  let stopped = false;
  return {
    databaseUrl,
    prisma,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await prisma.$disconnect();
      await container.stop();
    },
  };
}

function connectionString(container: StartedTestContainer): string {
  return `postgresql://scheduler:scheduler@${container.getHost()}:${container.getMappedPort(5432)}/service_scheduler?schema=public`;
}
