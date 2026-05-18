const asNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

export const readNumberEnv = (name, fallback) => {
  const parsed = asNumber(__ENV[name]);

  return parsed === null ? fallback : parsed;
};

export const readPositiveIntEnv = (name, fallback) => {
  const parsed = readNumberEnv(name, fallback);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
};

export const readDurationEnv = (name, fallback) => {
  const value = __ENV[name];

  return value === undefined || value.length === 0 ? fallback : value;
};

export const getWorkerBaseUrl = () => {
  const baseUrl = __ENV.MAILMON_LOAD_WORKER_BASE_URL ?? "http://127.0.0.1:3001";

  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
};

export const getRequestHeaders = () => {
  const headers = {
    "content-type": "application/json",
  };
  const authorization = __ENV.MAILMON_LOAD_AUTHORIZATION;

  if (authorization !== undefined && authorization.length > 0) {
    headers.authorization = authorization;
  }

  return headers;
};

export const getIdFromSet = (envName, prefix, setSize) => {
  const configuredIds =
    __ENV[envName]
      ?.split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0) ?? [];

  if (configuredIds.length > 0) {
    return configuredIds[(__VU + __ITER) % configuredIds.length];
  }

  return `${prefix}_${(__VU + __ITER) % setSize}`;
};

export const tryParseJson = (body) => {
  if (typeof body !== "string" || body.length === 0) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

export const recordStatus = (response, counters) => {
  const status = response.status;

  if (status >= 200 && status < 300) {
    counters.status2xx.add(1);
    return;
  }

  if (status >= 400 && status < 500) {
    counters.status4xx.add(1);
    return;
  }

  if (status >= 500 && status < 600) {
    counters.status5xx.add(1);
    return;
  }

  counters.statusOther.add(1);
};

const metricValue = (data, metricName, valueName) => {
  const value = data.metrics[metricName]?.values?.[valueName];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const counterCount = (data, metricName) => {
  const value = data.metrics[metricName]?.values?.count;

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const rateFromCounter = (count, total) => {
  if (total === 0) {
    return null;
  }

  return count / total;
};

const compareMax = (actual, budget) => {
  if (actual === null || budget === null) {
    return null;
  }

  return actual <= budget;
};

const comparison = (name, actual, budget, unit, description) => ({
  actual,
  budget,
  comparator: "<=",
  description,
  enforced: false,
  name,
  passed: compareMax(actual, budget),
  unit,
});

export const buildInternalRouteReport = ({
  budgets,
  counters,
  data,
  property,
  route,
  routeSpecificCounters = {},
  routeSpecificComparisons,
  scenario,
}) => {
  const totalRequests = counterCount(data, "http_reqs");
  const retryable5xxCount = counterCount(data, counters.retryable5xx);
  const status2xx = counterCount(data, counters.status2xx);
  const status4xx = counterCount(data, counters.status4xx);
  const status5xx = counterCount(data, counters.status5xx);
  const statusOther = counterCount(data, counters.statusOther);
  const dbPoolSaturation = asNumber(__ENV.MAILMON_LOAD_DB_POOL_SATURATION);

  const comparisons = [
    comparison(
      "p95_latency_ms",
      metricValue(data, "http_req_duration", "p(95)"),
      budgets.p95LatencyMs,
      "ms",
      "HTTP request p95 latency for the route.",
    ),
    comparison(
      "p99_latency_ms",
      metricValue(data, "http_req_duration", "p(99)"),
      budgets.p99LatencyMs,
      "ms",
      "HTTP request p99 latency for the route.",
    ),
    comparison(
      "retryable_5xx_rate",
      rateFromCounter(retryable5xxCount, totalRequests),
      budgets.retryable5xxRate,
      "ratio",
      "Retryable 5xx responses divided by total route requests.",
    ),
    comparison(
      "db_pool_saturation",
      dbPoolSaturation,
      budgets.dbPoolSaturation,
      "ratio",
      "Optional externally supplied DB pool saturation ratio.",
    ),
    ...routeSpecificComparisons(totalRequests),
  ];

  return {
    budgetsEnforced: false,
    generatedAt: new Date().toISOString(),
    property,
    route,
    scenario,
    statusCodeDistribution: {
      "2xx": status2xx,
      "4xx": status4xx,
      "5xx": status5xx,
      other: statusOther,
      totalRequests,
    },
    routeSpecificCounters,
    summary: {
      checksPassRate: metricValue(data, "checks", "rate"),
      durationMs: data.state?.testRunDurationMs ?? null,
      httpReqFailedRate: metricValue(data, "http_req_failed", "rate"),
      p95LatencyMs: metricValue(data, "http_req_duration", "p(95)"),
      p99LatencyMs: metricValue(data, "http_req_duration", "p(99)"),
      requestsPerSecond: data.metrics.http_reqs?.values?.rate ?? null,
      retryable5xxCount,
      retryable5xxRate: rateFromCounter(retryable5xxCount, totalRequests),
    },
    budgetComparisons: comparisons,
  };
};

export const renderReportSummary = (report) => {
  const lines = [
    "",
    `${report.scenario}: ${report.statusCodeDistribution.totalRequests} requests to ${report.route}`,
    `budgets enforced: ${String(report.budgetsEnforced)}`,
    `p95=${report.summary.p95LatencyMs ?? "n/a"}ms p99=${
      report.summary.p99LatencyMs ?? "n/a"
    }ms retryable_5xx_rate=${report.summary.retryable5xxRate ?? "n/a"}`,
    "budget report:",
  ];

  for (const item of report.budgetComparisons) {
    const status =
      item.passed === null ? "not_collected" : item.passed ? "within_budget" : "over_budget";
    lines.push(
      `  ${item.name}: actual=${item.actual ?? "n/a"} ${item.unit}, budget=${
        item.budget ?? "n/a"
      } ${item.unit}, ${status}`,
    );
  }

  lines.push("");

  return `${lines.join("\n")}\n`;
};
