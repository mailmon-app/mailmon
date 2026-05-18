#!/usr/bin/env tsx
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createSqlClient } from "../packages/db/src/client.js";

const execFileAsync = promisify(execFile);

interface CliOptions {
  readonly cleanupAfter: boolean;
  readonly cleanupOnly: boolean;
  readonly databaseUrl: string;
  readonly deadLetterSubscription: string | null;
  readonly pollMs: number;
  readonly projectId: string;
  readonly region: string | null;
  readonly requireRetryLog: boolean;
  readonly runId: string;
  readonly subscription: string | null;
  readonly timeoutMs: number;
  readonly topic: string;
  readonly workerService: string | null;
}

interface ExhaustionSnapshot {
  readonly mailbox_id: string;
  readonly sync_state: string;
  readonly last_error_code: string | null;
  readonly last_error_retryable: boolean | null;
  readonly sync_run_id: string | null;
  readonly sync_run_status: string | null;
  readonly sync_run_detail: string | null;
}

const usage = `Usage:
  pnpm exec tsx scripts/staging-pubsub-retry-smoke.ts --run-id <run-id>

Required via flags or environment:
  --run-id                              Unique run id for synthetic resources.
  --database-url / DATABASE_URL          Staging database URL reachable from this machine.
  --project-id / GCP_PROJECT_ID          GCP project containing staging Pub/Sub resources.
  --topic / MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME
                                        Full mailbox sync dispatch Pub/Sub topic name.

Cleanup-only mode requires only --run-id plus --database-url / DATABASE_URL.

Optional:
  --subscription                         Mailbox sync dispatch push subscription name.
  --dead-letter-subscription             Dead-letter push subscription name.
  --worker-service                       Cloud Run worker service name to verify fixture env.
  --region / GCP_REGION                  Cloud Run region for --worker-service.
  --timeout-ms                           Overall wait timeout. Default: 600000.
  --poll-ms                              Poll interval. Default: 5000.
  --require-retry-log                    Fail unless Cloud Logging shows at least two forced retry logs.
  --cleanup-after                        Delete synthetic DB rows after successful validation.
  --cleanup-only                         Delete synthetic DB rows for the run id and exit.
`;

const parseArgs = (argv: ReadonlyArray<string>): Record<string, string | true> => {
  const parsed: Record<string, string | true> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === undefined) {
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const equalsIndex = arg.indexOf("=");
    if (equalsIndex > 2) {
      parsed[arg.slice(2, equalsIndex)] = arg.slice(equalsIndex + 1);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (next === undefined || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
};

const getString = (
  parsed: Readonly<Record<string, string | true>>,
  key: string,
  envName?: string,
) => {
  const value = parsed[key];

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (envName !== undefined) {
    const envValue = process.env[envName];

    if (envValue !== undefined && envValue.length > 0) {
      return envValue;
    }
  }

  return null;
};

const getNumber = (
  parsed: Readonly<Record<string, string | true>>,
  key: string,
  fallback: number,
) => {
  const value = parsed[key];

  if (typeof value !== "string") {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`--${key} must be a positive integer.`);
  }

  return parsedValue;
};

const getOptions = (): CliOptions => {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help === true) {
    console.log(usage);
    process.exit(0);
  }

  const runId = getString(parsed, "run-id");
  const databaseUrl = getString(parsed, "database-url", "DATABASE_URL");
  const projectId = getString(parsed, "project-id", "GCP_PROJECT_ID");
  const topic = getString(parsed, "topic", "MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME");
  const cleanupOnly = parsed["cleanup-only"] === true;

  if (
    runId === null ||
    databaseUrl === null ||
    (!cleanupOnly && (projectId === null || topic === null))
  ) {
    throw new Error(`Missing required staging Pub/Sub smoke configuration.\n\n${usage}`);
  }

  if (!/^[A-Za-z0-9_-]+$/.test(runId)) {
    throw new Error("--run-id may only contain letters, numbers, underscores, and dashes.");
  }

  return {
    cleanupAfter: parsed["cleanup-after"] === true,
    cleanupOnly,
    databaseUrl,
    deadLetterSubscription: getString(
      parsed,
      "dead-letter-subscription",
      "MAILMON_SYNC_DISPATCH_DEAD_LETTER_SUBSCRIPTION_NAME",
    ),
    pollMs: getNumber(parsed, "poll-ms", 5_000),
    projectId: projectId ?? "",
    region: getString(parsed, "region", "GCP_REGION"),
    requireRetryLog: parsed["require-retry-log"] === true,
    runId,
    subscription: getString(
      parsed,
      "subscription",
      "MAILMON_SYNC_DISPATCH_PUBSUB_SUBSCRIPTION_NAME",
    ),
    timeoutMs: getNumber(parsed, "timeout-ms", 600_000),
    topic: topic ?? "",
    workerService: getString(parsed, "worker-service"),
  };
};

const createSyntheticIds = (runId: string) => {
  const suffix = runId.replaceAll("-", "_");

  return {
    mailboxId: `mbx_pubsub_retry_smoke_${suffix}`,
    workspaceId: `ws_pubsub_retry_smoke_${suffix}`,
  };
};

const runGcloud = async (args: ReadonlyArray<string>) => {
  try {
    const { stdout } = await execFileAsync("gcloud", [...args], {
      maxBuffer: 10 * 1024 * 1024,
    });

    return stdout.trim();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string"
    ) {
      throw new Error(error.stderr.trim());
    }

    throw error;
  }
};

const describePubSubResource = async (
  kind: "subscriptions" | "topics",
  name: string,
  projectId: string,
) => {
  await runGcloud(["pubsub", kind, "describe", name, "--project", projectId, "--format", "json"]);
};

const verifyWorkerFixtureIfRequested = async (
  options: CliOptions,
  mailboxId: string,
): Promise<void> => {
  if (options.workerService === null) {
    return;
  }

  if (options.region === null) {
    throw new Error("--region or GCP_REGION is required when --worker-service is provided.");
  }

  const serviceJson = await runGcloud([
    "run",
    "services",
    "describe",
    options.workerService,
    "--project",
    options.projectId,
    "--region",
    options.region,
    "--format",
    "json",
  ]);
  const serviceText = JSON.stringify(JSON.parse(serviceJson));

  if (
    !serviceText.includes("MAILMON_STAGING_PUBSUB_RETRY_SMOKE_MAILBOX_IDS") ||
    !serviceText.includes(mailboxId)
  ) {
    throw new Error(
      `Cloud Run service ${options.workerService} is not configured with MAILMON_STAGING_PUBSUB_RETRY_SMOKE_MAILBOX_IDS containing ${mailboxId}.`,
    );
  }
};

const seedSyntheticMailbox = async (
  databaseUrl: string,
  ids: ReturnType<typeof createSyntheticIds>,
) => {
  const sql = createSqlClient(databaseUrl);
  const now = new Date();

  try {
    await sql`
      insert into workspaces (id, created_at, updated_at)
      values (${ids.workspaceId}, ${now}, ${now})
      on conflict (id) do update set updated_at = excluded.updated_at
    `;
    await sql`
      insert into mailboxes (
        id,
        workspace_id,
        provider,
        tenant_external_id,
        mailbox_external_id,
        email_address,
        status,
        sync_state,
        watch_state,
        cursor,
        created_at,
        updated_at
      )
      values (
        ${ids.mailboxId},
        ${ids.workspaceId},
        'gmail',
        ${`tenant_${ids.mailboxId}`},
        ${`mailbox_${ids.mailboxId}`},
        ${`${ids.mailboxId}@mailmon.invalid`},
        'active',
        'healthy',
        'active',
        'hist_pubsub_retry_smoke_baseline',
        ${now},
        ${now}
      )
      on conflict (id) do update set
        sync_state = 'healthy',
        last_error_code = null,
        last_error_message = null,
        last_error_occurred_at = null,
        last_error_retryable = null,
        updated_at = excluded.updated_at
    `;
  } finally {
    await sql.end();
  }
};

const cleanupSyntheticRows = async (
  databaseUrl: string,
  ids: ReturnType<typeof createSyntheticIds>,
) => {
  const sql = createSqlClient(databaseUrl);

  try {
    await sql`delete from sync_runs where mailbox_id = ${ids.mailboxId}`;
    await sql`delete from mailboxes where id = ${ids.mailboxId}`;
    await sql`delete from workspaces where id = ${ids.workspaceId}`;
  } finally {
    await sql.end();
  }
};

const readExhaustionSnapshot = async (
  databaseUrl: string,
  mailboxId: string,
): Promise<ExhaustionSnapshot | null> => {
  const sql = createSqlClient(databaseUrl);

  try {
    const rows = await sql<ExhaustionSnapshot[]>`
      select
        m.id as mailbox_id,
        m.sync_state,
        m.last_error_code,
        m.last_error_retryable,
        sr.id as sync_run_id,
        sr.status as sync_run_status,
        sr.detail as sync_run_detail
      from mailboxes m
      left join lateral (
        select id, status, detail
        from sync_runs
        where mailbox_id = ${mailboxId}
          and status = 'dispatch_retry_exhausted'
        order by started_at desc, id desc
        limit 1
      ) sr on true
      where m.id = ${mailboxId}
      limit 1
    `;

    return rows[0] ?? null;
  } finally {
    await sql.end();
  }
};

const isRecordedExhaustion = (
  snapshot: ExhaustionSnapshot | null,
): snapshot is ExhaustionSnapshot =>
  snapshot !== null &&
  snapshot.sync_state === "failed" &&
  snapshot.last_error_code === "mailbox_sync_dispatch_retry_exhausted" &&
  snapshot.last_error_retryable === true &&
  snapshot.sync_run_id !== null &&
  snapshot.sync_run_status === "dispatch_retry_exhausted" &&
  snapshot.sync_run_detail === "mailbox_sync_dispatch_retry_exhausted";

const waitForExhaustion = async (options: CliOptions, mailboxId: string) => {
  const deadline = Date.now() + options.timeoutMs;
  let lastSnapshot: ExhaustionSnapshot | null = null;

  while (Date.now() < deadline) {
    lastSnapshot = await readExhaustionSnapshot(options.databaseUrl, mailboxId);

    if (isRecordedExhaustion(lastSnapshot)) {
      return lastSnapshot;
    }

    await new Promise((resolve) => setTimeout(resolve, options.pollMs));
  }

  throw new Error(
    `Timed out waiting for mailbox_sync_dispatch_retry_exhausted durable state for ${mailboxId}. Last DB snapshot: ${JSON.stringify(lastSnapshot)}`,
  );
};

const countForcedRetryLogs = async (
  options: CliOptions,
  mailboxId: string,
  startedAt: string,
) => {
  const filter = [
    `timestamp >= "${startedAt}"`,
    `(jsonPayload.event="mailbox_sync_staging_pubsub_retry_smoke_forced_retry" OR textPayload:"mailbox_sync_staging_pubsub_retry_smoke_forced_retry")`,
    `(jsonPayload.mailboxId="${mailboxId}" OR textPayload:"${mailboxId}")`,
  ].join("\n");
  const output = await runGcloud([
    "logging",
    "read",
    filter,
    "--project",
    options.projectId,
    "--format",
    "json",
    "--limit",
    "100",
  ]);
  const entries = JSON.parse(output) as unknown;

  return Array.isArray(entries) ? entries.length : 0;
};

const publishMailboxSync = async (options: CliOptions, mailboxId: string) => {
  const message = JSON.stringify({ mailboxId });
  const output = await runGcloud([
    "pubsub",
    "topics",
    "publish",
    options.topic,
    "--project",
    options.projectId,
    "--message",
    message,
    "--attribute",
    `kind=mailbox_sync`,
    "--attribute",
    `mailboxId=${mailboxId}`,
    "--format",
    "json",
  ]);

  return JSON.parse(output) as unknown;
};

const main = async () => {
  const options = getOptions();
  const ids = createSyntheticIds(options.runId);

  if (options.cleanupOnly) {
    await cleanupSyntheticRows(options.databaseUrl, ids);
    console.log(`Cleaned synthetic staging Pub/Sub smoke rows for run ${options.runId}.`);
    return;
  }

  const startedAt = new Date().toISOString();

  console.log(
    JSON.stringify({
      event: "staging_pubsub_retry_smoke_start",
      runId: options.runId,
      mailboxId: ids.mailboxId,
      workspaceId: ids.workspaceId,
      projectId: options.projectId,
      topic: options.topic,
      subscription: options.subscription,
      deadLetterSubscription: options.deadLetterSubscription,
      startedAt,
    }),
  );

  await describePubSubResource("topics", options.topic, options.projectId);

  if (options.subscription !== null) {
    await describePubSubResource("subscriptions", options.subscription, options.projectId);
  }

  if (options.deadLetterSubscription !== null) {
    await describePubSubResource(
      "subscriptions",
      options.deadLetterSubscription,
      options.projectId,
    );
  }

  await verifyWorkerFixtureIfRequested(options, ids.mailboxId);
  await seedSyntheticMailbox(options.databaseUrl, ids);

  const publishResult = await publishMailboxSync(options, ids.mailboxId);
  console.log(
    JSON.stringify({
      event: "staging_pubsub_retry_smoke_published",
      runId: options.runId,
      mailboxId: ids.mailboxId,
      publishResult,
    }),
  );

  const snapshot = await waitForExhaustion(options, ids.mailboxId);
  let forcedRetryLogCount = 0;

  try {
    forcedRetryLogCount = await countForcedRetryLogs(options, ids.mailboxId, startedAt);
  } catch (error) {
    if (options.requireRetryLog) {
      throw error;
    }

    console.warn(
      `Could not read Cloud Logging retry evidence; durable dead-letter state was still verified. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (options.requireRetryLog && forcedRetryLogCount < 2) {
    throw new Error(
      `Expected at least two forced retry logs for ${ids.mailboxId}; found ${forcedRetryLogCount}.`,
    );
  }

  console.log(
    JSON.stringify({
      event: "staging_pubsub_retry_smoke_passed",
      runId: options.runId,
      mailboxId: ids.mailboxId,
      syncRunId: snapshot.sync_run_id,
      forcedRetryLogCount,
      cleanupCommand: `pnpm exec tsx scripts/staging-pubsub-retry-smoke.ts --run-id ${options.runId} --cleanup-only`,
    }),
  );

  if (options.cleanupAfter) {
    await cleanupSyntheticRows(options.databaseUrl, ids);
    console.log(`Cleaned synthetic staging Pub/Sub smoke rows for run ${options.runId}.`);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
