# Mailboxes

## Overview

Mailbox connection, inspection, and sync observability operations.

### Available Operations

* [createConnectSession](#createconnectsession) - Create a mailbox connect session
* [getById](#getbyid) - Get a mailbox
* [listSyncRuns](#listsyncruns) - List mailbox sync runs
* [getObservability](#getobservability) - Get mailbox observability

## createConnectSession

Create a mailbox connect session

### Example Usage

<!-- UsageSnippet language="typescript" operationID="mailboxes_create_connect_session" method="post" path="/v1/mailboxes/connect-sessions" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.mailboxes.createConnectSession({
    provider: "gmail",
    tenantExternalId: "<id>",
    mailboxExternalId: "<id>",
    redirectUrl: "https://courteous-valley.name",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { mailboxesCreateConnectSession } from "@mailmon.dev/sdk/funcs/mailboxes-create-connect-session.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await mailboxesCreateConnectSession(mailmon, {
    provider: "gmail",
    tenantExternalId: "<id>",
    mailboxExternalId: "<id>",
    redirectUrl: "https://courteous-valley.name",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("mailboxesCreateConnectSession failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.CreateConnectSessionRequest](../../models/create-connect-session-request.md)                                                                                           | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.ConnectSession](../../models/connect-session.md)\>**

### Errors

| Error Type                 | Status Code                | Content Type               |
| -------------------------- | -------------------------- | -------------------------- |
| errors.ProblemDetailsError | 400                        | application/json           |
| errors.MailmonDefaultError | 4XX, 5XX                   | \*/\*                      |

## getById

Get a mailbox

### Example Usage

<!-- UsageSnippet language="typescript" operationID="mailboxes_get" method="get" path="/v1/mailboxes/{mailboxId}" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.mailboxes.getById({
    mailboxId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { mailboxesGetById } from "@mailmon.dev/sdk/funcs/mailboxes-get-by-id.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await mailboxesGetById(mailmon, {
    mailboxId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("mailboxesGetById failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.MailboxesGetRequest](../../models/operations/mailboxes-get-request.md)                                                                                             | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.Mailbox](../../models/mailbox.md)\>**

### Errors

| Error Type                 | Status Code                | Content Type               |
| -------------------------- | -------------------------- | -------------------------- |
| errors.ProblemDetailsError | 400, 404                   | application/json           |
| errors.MailmonDefaultError | 4XX, 5XX                   | \*/\*                      |

## listSyncRuns

List mailbox sync runs

### Example Usage

<!-- UsageSnippet language="typescript" operationID="mailboxes_list_sync_runs" method="get" path="/v1/mailboxes/{mailboxId}/sync-runs" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.mailboxes.listSyncRuns({
    mailboxId: "<id>",
  });

  for await (const page of result) {
    console.log(page);
  }
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { mailboxesListSyncRuns } from "@mailmon.dev/sdk/funcs/mailboxes-list-sync-runs.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await mailboxesListSyncRuns(mailmon, {
    mailboxId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    for await (const page of result) {
    console.log(page);
  }
  } else {
    console.log("mailboxesListSyncRuns failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.MailboxesListSyncRunsRequest](../../models/operations/mailboxes-list-sync-runs-request.md)                                                                         | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.MailboxesListSyncRunsResponse](../../models/operations/mailboxes-list-sync-runs-response.md)\>**

### Errors

| Error Type                 | Status Code                | Content Type               |
| -------------------------- | -------------------------- | -------------------------- |
| errors.ProblemDetailsError | 400                        | application/json           |
| errors.MailmonDefaultError | 4XX, 5XX                   | \*/\*                      |

## getObservability

Get mailbox observability

### Example Usage

<!-- UsageSnippet language="typescript" operationID="mailboxes_get_observability" method="get" path="/v1/mailboxes/{mailboxId}/observability" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.mailboxes.getObservability({
    mailboxId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { mailboxesGetObservability } from "@mailmon.dev/sdk/funcs/mailboxes-get-observability.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await mailboxesGetObservability(mailmon, {
    mailboxId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("mailboxesGetObservability failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.MailboxesGetObservabilityRequest](../../models/operations/mailboxes-get-observability-request.md)                                                                  | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.MailboxObservability](../../models/mailbox-observability.md)\>**

### Errors

| Error Type                 | Status Code                | Content Type               |
| -------------------------- | -------------------------- | -------------------------- |
| errors.ProblemDetailsError | 400, 404                   | application/json           |
| errors.MailmonDefaultError | 4XX, 5XX                   | \*/\*                      |