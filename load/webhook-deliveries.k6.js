import { check, sleep } from "k6";
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

const route = "/internal/webhook-deliveries";
const status2xx = new Counter("internal_webhook_deliveries_status_2xx");
const status4xx = new Counter("internal_webhook_deliveries_status_4xx");
const status5xx = new Counter("internal_webhook_deliveries_status_5xx");
const statusOther = new Counter("internal_webhook_deliveries_status_other");
const retryable5xx = new Counter("internal_webhook_deliveries_retryable_5xx");
const claimContention = new Counter("internal_webhook_deliveries_claim_contention");
const scheduledForRetry = new Counter("internal_webhook_deliveries_scheduled_for_retry");

const budgets = {
  p95LatencyMs: readNumberEnv("MAILMON_LOAD_WEBHOOK_P95_LATENCY_MS", 2000),
  p99LatencyMs: readNumberEnv("MAILMON_LOAD_WEBHOOK_P99_LATENCY_MS", 5000),
  retryable5xxRate: readNumberEnv("MAILMON_LOAD_WEBHOOK_RETRYABLE_5XX_RATE", 0.25),
  dbPoolSaturation: readNumberEnv("MAILMON_LOAD_DB_POOL_SATURATION_BUDGET", 0.85),
  maxClaimContentionRate: readNumberEnv("MAILMON_LOAD_WEBHOOK_MAX_CLAIM_CONTENTION_RATE", 0.95),
  maxInFlightProcessingRowsAfterSettle: readNumberEnv(
    "MAILMON_LOAD_WEBHOOK_MAX_IN_FLIGHT_PROCESSING_ROWS_AFTER_SETTLE",
    0,
  ),
};

const deliverySetSize = readPositiveIntEnv("MAILMON_LOAD_WEBHOOK_DELIVERY_SET_SIZE", 16);
const deliveryPrefix = __ENV.MAILMON_LOAD_WEBHOOK_DELIVERY_ID_PREFIX ?? "del_load_webhook";
const requestTimeout = readDurationEnv("MAILMON_LOAD_REQUEST_TIMEOUT", "10s");

export const options = {
  summaryTrendStats: ["avg", "min", "med", "p(95)", "p(99)", "max"],
  scenarios: {
    internal_webhook_delivery_contention: {
      duration: readDurationEnv("MAILMON_LOAD_WEBHOOK_DURATION", "30s"),
      executor: "constant-vus",
      gracefulStop: "5s",
      vus: readPositiveIntEnv("MAILMON_LOAD_WEBHOOK_VUS", 16),
    },
  },
};

const createRequestBody = (deliveryId) =>
  JSON.stringify({
    deliveryId,
    notBefore: __ENV.MAILMON_LOAD_WEBHOOK_NOT_BEFORE ?? new Date(Date.now() - 1000).toISOString(),
  });

export default function () {
  const deliveryId = getIdFromSet(
    "MAILMON_LOAD_WEBHOOK_DELIVERY_IDS",
    deliveryPrefix,
    deliverySetSize,
  );
  const response = http.post(`${getWorkerBaseUrl()}${route}`, createRequestBody(deliveryId), {
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

  if (responseBody?.status === "noop") {
    claimContention.add(1);
  }

  if (responseBody?.status === "scheduled_for_retry") {
    scheduledForRetry.add(1);
  }

  check(response, {
    "webhook delivery returned a classified worker response": (candidate) =>
      candidate.status > 0 && candidate.status !== 404,
    "webhook delivery response body is JSON": () => responseBody !== null,
  });

  sleep(readNumberEnv("MAILMON_LOAD_WEBHOOK_SLEEP_SECONDS", 0.05));
}

export function handleSummary(data) {
  const claimContentionCount = counterCount(data, "internal_webhook_deliveries_claim_contention");
  const scheduledForRetryCount = counterCount(
    data,
    "internal_webhook_deliveries_scheduled_for_retry",
  );
  const inFlightAfterSettle =
    __ENV.MAILMON_LOAD_WEBHOOK_PROCESSING_ROWS_AFTER_SETTLE === undefined
      ? null
      : Number(__ENV.MAILMON_LOAD_WEBHOOK_PROCESSING_ROWS_AFTER_SETTLE);
  const report = buildInternalRouteReport({
    budgets,
    counters: {
      retryable5xx: "internal_webhook_deliveries_retryable_5xx",
      status2xx: "internal_webhook_deliveries_status_2xx",
      status4xx: "internal_webhook_deliveries_status_4xx",
      status5xx: "internal_webhook_deliveries_status_5xx",
      statusOther: "internal_webhook_deliveries_status_other",
    },
    data,
    property: "internal-route-load-maintains-backpressure",
    route,
    routeSpecificCounters: {
      claimContention: claimContentionCount,
      scheduledForRetry: scheduledForRetryCount,
    },
    routeSpecificComparisons: (totalRequests) => [
      {
        actual: totalRequests === 0 ? null : claimContentionCount / totalRequests,
        budget: budgets.maxClaimContentionRate,
        comparator: "<=",
        description:
          "No-op claim-contention responses divided by total /internal/webhook-deliveries requests.",
        enforced: false,
        name: "webhook_claim_contention_rate",
        passed:
          totalRequests === 0
            ? null
            : claimContentionCount / totalRequests <= budgets.maxClaimContentionRate,
        unit: "ratio",
      },
      {
        actual: Number.isFinite(inFlightAfterSettle) ? inFlightAfterSettle : null,
        budget: budgets.maxInFlightProcessingRowsAfterSettle,
        comparator: "<=",
        description:
          "Optional externally supplied processing-row count after the workload settles.",
        enforced: false,
        name: "webhook_processing_rows_after_settle",
        passed:
          Number.isFinite(inFlightAfterSettle) && inFlightAfterSettle !== null
            ? inFlightAfterSettle <= budgets.maxInFlightProcessingRowsAfterSettle
            : null,
        unit: "rows",
      },
    ],
    scenario: "internal_webhook_delivery_contention",
  });
  const reportPath =
    __ENV.MAILMON_LOAD_REPORT_PATH ?? "load/results/webhook-deliveries-summary.json";

  return {
    [reportPath]: `${JSON.stringify(report, null, 2)}\n`,
    stdout: renderReportSummary(report),
  };
}
