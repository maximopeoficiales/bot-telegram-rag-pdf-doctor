import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const runIntegration = process.env.RUN_DB_INTEGRATION === 'true' && Boolean(databaseUrl);

describe.skipIf(!runIntegration)('database migrations', () => {
  const sql = postgres(databaseUrl!, { max: 1, prepare: false });
  const db = drizzle(sql);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
  });

  afterAll(async () => {
    await sql.end();
  });

  it('enables pgvector and creates foundational tables', async () => {
    const [{ vectorInstalled }] = await sql<{ vectorInstalled: boolean }[]>`
      select exists(select 1 from pg_extension where extname = 'vector') as "vectorInstalled"
    `;

    const tables = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('telegram_users', 'patient_cases', 'knowledge_chunks')
      order by table_name
    `;

    expect(vectorInstalled).toBe(true);
    expect(tables.map((row) => row.table_name)).toEqual(['knowledge_chunks', 'patient_cases', 'telegram_users']);
  });
});
