import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { Effect } from "effect";
import postgres from "postgres";

export interface IsolatedDatabase {
  readonly adminConnectionString: string;
  readonly connectionString: string;
  readonly databaseName: string;
}

const DEFAULT_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://mailmon:mailmon@localhost:5432/mailmon";
const migrationDirectory = new URL("../drizzle/", import.meta.url);
const templateDatabaseName = "mailmon_test_template";
const templateReadyMarkerTable = "mailmon_test_template_ready";
const templateAdvisoryLock = {
  keyHigh: 1_831_001,
  keyLow: 4_207_019,
} as const;

let cachedMigrationFingerprint: string | null = null;
const templateInitializedByDatabaseUrlAndFingerprint = new Set<string>();

const withDatabaseName = (connectionString: string, databaseName: string) => {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;

  return url.toString();
};

const toAdminConnectionString = (connectionString: string) => {
  return withDatabaseName(connectionString, "postgres");
};

const createDatabaseName = () => {
  return `mailmon_test_${randomUUID().replaceAll("-", "")}`;
};

const quoteIdentifier = (identifier: string) => {
  return `"${identifier.replaceAll('"', '""')}"`;
};

const readSortedMigrationFiles = async () => {
  const entries = await readdir(migrationDirectory);
  const migrationFiles = entries.filter((entry) => entry.endsWith(".sql"));
  // oxlint-disable-next-line unicorn/no-array-sort
  migrationFiles.sort((left, right) => left.localeCompare(right));

  return migrationFiles;
};

const readMigrationStatements = async () => {
  const migrationFiles = await readSortedMigrationFiles();
  const statements = await Promise.all(
    migrationFiles.map(async (migrationFile: string) => {
      const sqlText = await readFile(
        new URL(`../drizzle/${migrationFile}`, import.meta.url),
        "utf8",
      );

      return sqlText
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);
    }),
  );

  return statements.flat();
};

const readMigrationFingerprint = async () => {
  if (cachedMigrationFingerprint !== null) {
    return cachedMigrationFingerprint;
  }

  const migrationFiles = await readSortedMigrationFiles();
  const migrationContents = await Promise.all(
    migrationFiles.map((migrationFile) =>
      readFile(new URL(`../drizzle/${migrationFile}`, import.meta.url), "utf8"),
    ),
  );

  cachedMigrationFingerprint = JSON.stringify({
    files: migrationFiles,
    lengths: migrationContents.map((content) => content.length),
    joined: migrationContents.join("\n-- next migration --\n"),
  });

  return cachedMigrationFingerprint;
};

const applyMigrations = async (connectionString: string) => {
  const client = postgres(connectionString, { max: 1 });

  try {
    for (const statement of await readMigrationStatements()) {
      await client.unsafe(statement);
    }
  } finally {
    await client.end();
  }
};

const terminateDatabaseConnections = async (adminClient: postgres.Sql, databaseName: string) => {
  await adminClient.unsafe(
    `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1
        AND pid <> pg_backend_pid()
    `,
    [databaseName],
  );
};

const templateExists = async (adminClient: postgres.Sql) => {
  const rows = await adminClient<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1
      FROM pg_database
      WHERE datname = ${templateDatabaseName}
    ) AS "exists"
  `;

  return rows[0]?.exists === true;
};

const createTemplateDatabase = async (adminClient: postgres.Sql) => {
  await adminClient.unsafe(`CREATE DATABASE ${quoteIdentifier(templateDatabaseName)}`);
};

const dropTemplateDatabaseIfPresent = async (adminClient: postgres.Sql) => {
  await terminateDatabaseConnections(adminClient, templateDatabaseName);
  await adminClient.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(templateDatabaseName)}`);
};

const markTemplateReady = async (connectionString: string, fingerprint: string) => {
  const client = postgres(connectionString, { max: 1 });

  try {
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(templateReadyMarkerTable)} (
        id INTEGER PRIMARY KEY,
        migration_fingerprint TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.unsafe(
      `
        INSERT INTO ${quoteIdentifier(templateReadyMarkerTable)} (id, migration_fingerprint)
        VALUES (1, $1)
        ON CONFLICT (id)
        DO UPDATE SET migration_fingerprint = EXCLUDED.migration_fingerprint,
                      updated_at = NOW()
      `,
      [fingerprint],
    );
  } finally {
    await client.end();
  }
};

const readTemplateMigrationFingerprint = async (connectionString: string) => {
  const client = postgres(connectionString, { max: 1 });

  try {
    const markerExistsRows = await client<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ${templateReadyMarkerTable}
      ) AS "exists"
    `;

    if (!markerExistsRows[0]?.exists) {
      return null;
    }

    const fingerprintRows = await client<
      {
        migrationFingerprint: string;
      }[]
    >`
      SELECT migration_fingerprint AS "migrationFingerprint"
      FROM ${client(templateReadyMarkerTable)}
      WHERE id = 1
      LIMIT 1
    `;

    return fingerprintRows[0]?.migrationFingerprint ?? null;
  } catch {
    return null;
  } finally {
    await client.end();
  }
};

const templateIsReadyForFingerprint = async (connectionString: string, fingerprint: string) => {
  const templateFingerprint = await readTemplateMigrationFingerprint(connectionString);

  return templateFingerprint === fingerprint;
};

const ensureTemplateDatabase = async (databaseUrl = DEFAULT_DATABASE_URL) => {
  const migrationFingerprint = await readMigrationFingerprint();
  const cacheKey = `${databaseUrl}\n${migrationFingerprint}`;

  if (templateInitializedByDatabaseUrlAndFingerprint.has(cacheKey)) {
    return;
  }

  const adminConnectionString = toAdminConnectionString(databaseUrl);
  const adminClient = postgres(adminConnectionString, { max: 1 });

  try {
    await adminClient`SELECT pg_advisory_lock(${templateAdvisoryLock.keyHigh}, ${templateAdvisoryLock.keyLow})`;

    const templateConnectionString = withDatabaseName(databaseUrl, templateDatabaseName);
    const templateAlreadyExists = await templateExists(adminClient);

    if (templateAlreadyExists) {
      const ready = await templateIsReadyForFingerprint(
        templateConnectionString,
        migrationFingerprint,
      );

      if (ready) {
        templateInitializedByDatabaseUrlAndFingerprint.add(cacheKey);
        return;
      }

      const existingFingerprint = await readTemplateMigrationFingerprint(templateConnectionString);

      if (existingFingerprint !== null) {
        templateInitializedByDatabaseUrlAndFingerprint.clear();
      }

      await dropTemplateDatabaseIfPresent(adminClient);
    }

    await createTemplateDatabase(adminClient);
    await applyMigrations(templateConnectionString);
    await markTemplateReady(templateConnectionString, migrationFingerprint);
    templateInitializedByDatabaseUrlAndFingerprint.add(cacheKey);
  } finally {
    await adminClient`SELECT pg_advisory_unlock(${templateAdvisoryLock.keyHigh}, ${templateAdvisoryLock.keyLow})`;
    await adminClient.end();
  }
};

const createIsolatedDatabase = async (
  databaseUrl = DEFAULT_DATABASE_URL,
): Promise<IsolatedDatabase> => {
  await ensureTemplateDatabase(databaseUrl);

  const databaseName = createDatabaseName();
  const adminConnectionString = toAdminConnectionString(databaseUrl);
  const connectionString = withDatabaseName(databaseUrl, databaseName);
  const adminClient = postgres(adminConnectionString, { max: 1 });

  try {
    await adminClient.unsafe(
      `CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE ${quoteIdentifier(templateDatabaseName)}`,
    );
  } finally {
    await adminClient.end();
  }

  return {
    adminConnectionString,
    connectionString,
    databaseName,
  };
};

const dropIsolatedDatabase = async (database: IsolatedDatabase) => {
  const adminClient = postgres(database.adminConnectionString, { max: 1 });

  try {
    await terminateDatabaseConnections(adminClient, database.databaseName);
    await adminClient.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(database.databaseName)}`);
  } finally {
    await adminClient.end();
  }
};

export const withIsolatedDatabaseEffect = <A, E>(
  run: (database: IsolatedDatabase) => Effect.Effect<A, E>,
  options: Readonly<{
    databaseUrl?: string;
  }> = {},
) =>
  Effect.acquireUseRelease(
    Effect.promise(() => createIsolatedDatabase(options.databaseUrl)),
    run,
    (database) => Effect.promise(() => dropIsolatedDatabase(database)),
  );

export const withIsolatedDatabasePromise = async <T>(
  run: (database: IsolatedDatabase) => Promise<T>,
  options: Readonly<{
    databaseUrl?: string;
  }> = {},
) => {
  const database = await createIsolatedDatabase(options.databaseUrl);

  try {
    return await run(database);
  } finally {
    await dropIsolatedDatabase(database);
  }
};
