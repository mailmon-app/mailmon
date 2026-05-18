import { check, sleep } from "k6";
import encoding from "k6/encoding";
import http from "k6/http";
import { Counter } from "k6/metrics";

import {
  buildInternalRouteReport,
  counterCount,
  getIdFromSet,
  getRequestHeaders,
  getWorkerBaseUrl,
  readDurationEnv,
  readNumberEnv,
  readPositiveIntEnv,
  recordStatus,
  renderReportSummary,
  tryParseJson,
} from "./lib/internal-route-budget-report.js";

const route = "/internal/sync";
const status2xx = new Counter("internal_sync_status_2xx");
const status4xx = new Counter("internal_sync_status_4xx");
const status5xx = new Counter("internal_sync_status_5xx");
const statusOther = new Counter("internal_sync_status_other");
const retryable5xx = new Counter("internal_sync_retryable_5xx");
const leaseContention = new Counter("internal_sync_lease_contention");

const budgets = {
  p95LatencyMs: readNumberEnv("MAILMON_LOAD_SYNC_P95_LATENCY_MS", 2000),
  p99LatencyMs: readNumberEnv("MAILMON_LOAD_SYNC_P99_LATENCY_MS", 5000),
  retryable5xxRate: readNumberEnv("MAILMON_LOAD_SYNC_RETRYABLE_5XX_RATE", 0.25),
  dbPoolSaturation: readNumberEnv("MAILMON_LOAD_DB_POOL_SATURATION_BUDGET", 0.85),
  maxLeaseContentionRate: readNumberEnv("MAILMON_LOAD_SYNC_MAX_LEASE_CONTENTION_RATE", 0.95),
};

const mailboxSetSize = readPositiveIntEnv("MAILMON_LOAD_SYNC_MAILBOX_SET_SIZE", 4);
const mailboxPrefix = __ENV.MAILMON_LOAD_SYNC_MAILBOX_ID_PREFIX ?? "mbx_load_sync";
const requestTimeout = readDurationEnv("MAILMON_LOAD_REQUEST_TIMEOUT", "10s");

export const options = {
  summaryTrendStats: ["avg", "min", "med", "p(95)", "p(99)", "max"],
  scenarios: {
    internal_sync_contention: {
      duration: readDurationEnv("MAILMON_LOAD_SYNC_DURATION", "30s"),
      executor: "constant-vus",
      gracefulStop: "5s",
      vus: readPositiveIntEnv("MAILMON_LOAD_SYNC_VUS", 16),
    },
  },
};

const createRequestBody = (mailboxId) => {
  const body = JSON.stringify({ mailboxId });

  if (__ENV.MAILMON_LOAD_SYNC_ENVELOPE === "gcp-pubsub") {
    return JSON.stringify({
      message: {
        data: encoding.b64encode(body),
        messageId: `k6-sync-${__VU}-${__ITER}`,
      },
      subscription: __ENV.MAILMON_LOAD_SYNC_SUBSCRIPTION ?? "k6-internal-sync-load",
    });
  }

  return body;
};

export default function () {
  const mailboxId = getIdFromSet("MAILMON_LOAD_SYNC_MAILBOX_IDS", mailboxPrefix, mailboxSetSize);
  const response = http.post(`${getWorkerBaseUrl()}${route}`, createRequestBody(mailboxId), {
    headers: getRequestHeaders(),
    tags: {
      property: "internal-route-load-maintains-backpressure",
      route,
    },
    timeout: requestTimeout,
  });
  const responseBody = tryParseJson(response.body);

  recordStatus(response, {
    status2xx,
    status4xx,
    status5xx,
    statusOther,
  });

  if (response.status >= 500 && response.status < 600 && responseBody?.retryable === true) {
    retryable5xx.add(1);
  }

  if (responseBody?.status === "skipped_due_to_active_lease") {
    leaseContention.add(1);
  }

  check(response, {
    "internal sync returned a classified worker response": (candidate) =>
      candidate.status > 0 && candidate.status !== 404,
    "internal sync response body is JSON": () => responseBody !== null,
  });

  sleep(readNumberEnv("MAILMON_LOAD_SYNC_SLEEP_SECONDS", 0.05));
}

export function handleSummary(data) {
  const leaseContentionCount = counterCount(data, "internal_sync_lease_contention");
  const report = buildInternalRouteReport({
    budgets,
    counters: {
      retryable5xx: "internal_sync_retryable_5xx",
      status2xx: "internal_sync_status_2xx",
      status4xx: "internal_sync_status_4xx",
      status5xx: "internal_sync_status_5xx",
      statusOther: "internal_sync_status_other",
    },
    data,
    property: "internal-route-load-maintains-backpressure",
    route,
    routeSpecificCounters: {
      leaseContention: leaseContentionCount,
    },
    routeSpecificComparisons: (totalRequests) => [
      {
        actual: totalRequests === 0 ? null : leaseContentionCount / totalRequests,
        budget: budgets.maxLeaseContentionRate,
        comparator: "<=",
        description: "Lease-contention responses divided by total /internal/sync requests.",
        enforced: false,
        name: "lease_contention_rate",
        passed:
          totalRequests === 0
            ? null
            : leaseContentionCount / totalRequests <= budgets.maxLeaseContentionRate,
        unit: "ratio",
      },
    ],
    scenario: "internal_sync_contention",
  });
  const reportPath = __ENV.MAILMON_LOAD_REPORT_PATH ?? "load/results/internal-sync-summary.json";

  return {
    [reportPath]: `${JSON.stringify(report, null, 2)}\n`,
    stdout: renderReportSummary(report),
  };
}
