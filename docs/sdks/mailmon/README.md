# Mailmon SDK

## Overview

Mailmon API: Development documentation

### Available Operations

* [postV1MailboxesConnectSessions](#postv1mailboxesconnectsessions) - Create a mailbox connect session
* [postV1WebhookEndpoints](#postv1webhookendpoints) - Create a webhook endpoint
* [postV1WebhookEndpointsByEndpointIdSubscriptions](#postv1webhookendpointsbyendpointidsubscriptions) - Create mailbox-scoped webhook subscriptions
* [getV1MailboxesByMailboxId](#getv1mailboxesbymailboxid) - Get a mailbox
* [getV1MailboxesByMailboxIdSyncRuns](#getv1mailboxesbymailboxidsyncruns) - List mailbox sync runs
* [getV1MailboxesByMailboxIdObservability](#getv1mailboxesbymailboxidobservability) - Get mailbox observability
* [postV1Replays](#postv1replays) - Create a mailbox event replay
* [getV1ReplaysByReplayId](#getv1replaysbyreplayid) - Get a replay
* [getV1Messages](#getv1messages) - List mailbox messages
* [getV1MessagesByMessageId](#getv1messagesbymessageid) - Get a message
* [getV1Threads](#getv1threads) - List mailbox threads
* [getV1ThreadsByThreadId](#getv1threadsbythreadid) - Get a thread

## postV1MailboxesConnectSessions

Create a mailbox connect session

### Example Usage

<!-- UsageSnippet language="typescript" operationID="postV1MailboxesConnectSessions" method="post" path="/v1/mailboxes/connect-sessions" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.postV1MailboxesConnectSessions({
    provider: "gmail",
    tenantExternalId: "<id>",
    mailboxExternalId: "<id>",
    redirectUrl: "https://firm-pharmacopoeia.com",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { postV1MailboxesConnectSessions } from "@mailmon.dev/sdk/funcs/post-v1-mailboxes-connect-sessions.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await postV1MailboxesConnectSessions(mailmon, {
    provider: "gmail",
    tenantExternalId: "<id>",
    mailboxExternalId: "<id>",
    redirectUrl: "https://firm-pharmacopoeia.com",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("postV1MailboxesConnectSessions failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.PostV1MailboxesConnectSessionsRequest](../../models/operations/post-v1-mailboxes-connect-sessions-request.md)                                                      | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.PostV1MailboxesConnectSessionsResponse](../../models/operations/post-v1-mailboxes-connect-sessions-response.md)\>**

### Errors

| Error Type                                           | Status Code                                          | Content Type                                         |
| ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| errors.PostV1MailboxesConnectSessionsBadRequestError | 400                                                  | application/json                                     |
| errors.MailmonDefaultError                           | 4XX, 5XX                                             | \*/\*                                                |

## postV1WebhookEndpoints

Create a webhook endpoint

### Example Usage

<!-- UsageSnippet language="typescript" operationID="postV1WebhookEndpoints" method="post" path="/v1/webhook-endpoints" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.postV1WebhookEndpoints({
    url: "https://ashamed-cemetery.info",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { postV1WebhookEndpoints } from "@mailmon.dev/sdk/funcs/post-v1-webhook-endpoints.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await postV1WebhookEndpoints(mailmon, {
    url: "https://ashamed-cemetery.info",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("postV1WebhookEndpoints failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.PostV1WebhookEndpointsRequest](../../models/operations/post-v1-webhook-endpoints-request.md)                                                                       | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.PostV1WebhookEndpointsResponse](../../models/operations/post-v1-webhook-endpoints-response.md)\>**

### Errors

| Error Type                                   | Status Code                                  | Content Type                                 |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| errors.PostV1WebhookEndpointsBadRequestError | 400                                          | application/json                             |
| errors.MailmonDefaultError                   | 4XX, 5XX                                     | \*/\*                                        |

## postV1WebhookEndpointsByEndpointIdSubscriptions

Create mailbox-scoped webhook subscriptions

### Example Usage

<!-- UsageSnippet language="typescript" operationID="postV1WebhookEndpointsByEndpointIdSubscriptions" method="post" path="/v1/webhook-endpoints/{endpointId}/subscriptions" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.postV1WebhookEndpointsByEndpointIdSubscriptions({
    endpointId: "<id>",
    body: {
      mailboxIds: [
        "<value>",
      ],
      eventTypes: [],
    },
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { postV1WebhookEndpointsByEndpointIdSubscriptions } from "@mailmon.dev/sdk/funcs/post-v1-webhook-endpoints-by-endpoint-id-subscriptions.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await postV1WebhookEndpointsByEndpointIdSubscriptions(mailmon, {
    endpointId: "<id>",
    body: {
      mailboxIds: [
        "<value>",
      ],
      eventTypes: [],
    },
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("postV1WebhookEndpointsByEndpointIdSubscriptions failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.PostV1WebhookEndpointsByEndpointIdSubscriptionsRequest](../../models/operations/post-v1-webhook-endpoints-by-endpoint-id-subscriptions-request.md)                 | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.PostV1WebhookEndpointsByEndpointIdSubscriptionsResponse](../../models/operations/post-v1-webhook-endpoints-by-endpoint-id-subscriptions-response.md)\>**

### Errors

| Error Type                                                            | Status Code                                                           | Content Type                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| errors.PostV1WebhookEndpointsByEndpointIdSubscriptionsBadRequestError | 400                                                                   | application/json                                                      |
| errors.PostV1WebhookEndpointsByEndpointIdSubscriptionsNotFoundError   | 404                                                                   | application/json                                                      |
| errors.MailmonDefaultError                                            | 4XX, 5XX                                                              | \*/\*                                                                 |

## getV1MailboxesByMailboxId

Get a mailbox

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getV1MailboxesByMailboxId" method="get" path="/v1/mailboxes/{mailboxId}" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.getV1MailboxesByMailboxId({
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
import { getV1MailboxesByMailboxId } from "@mailmon.dev/sdk/funcs/get-v1-mailboxes-by-mailbox-id.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await getV1MailboxesByMailboxId(mailmon, {
    mailboxId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("getV1MailboxesByMailboxId failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.GetV1MailboxesByMailboxIdRequest](../../models/operations/get-v1-mailboxes-by-mailbox-id-request.md)                                                               | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetV1MailboxesByMailboxIdResponse](../../models/operations/get-v1-mailboxes-by-mailbox-id-response.md)\>**

### Errors

| Error Type                                      | Status Code                                     | Content Type                                    |
| ----------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| errors.GetV1MailboxesByMailboxIdBadRequestError | 400                                             | application/json                                |
| errors.GetV1MailboxesByMailboxIdNotFoundError   | 404                                             | application/json                                |
| errors.MailmonDefaultError                      | 4XX, 5XX                                        | \*/\*                                           |

## getV1MailboxesByMailboxIdSyncRuns

List mailbox sync runs

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getV1MailboxesByMailboxIdSyncRuns" method="get" path="/v1/mailboxes/{mailboxId}/sync-runs" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.getV1MailboxesByMailboxIdSyncRuns({
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
import { getV1MailboxesByMailboxIdSyncRuns } from "@mailmon.dev/sdk/funcs/get-v1-mailboxes-by-mailbox-id-sync-runs.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await getV1MailboxesByMailboxIdSyncRuns(mailmon, {
    mailboxId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("getV1MailboxesByMailboxIdSyncRuns failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.GetV1MailboxesByMailboxIdSyncRunsRequest](../../models/operations/get-v1-mailboxes-by-mailbox-id-sync-runs-request.md)                                             | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetV1MailboxesByMailboxIdSyncRunsResponse](../../models/operations/get-v1-mailboxes-by-mailbox-id-sync-runs-response.md)\>**

### Errors

| Error Type                                              | Status Code                                             | Content Type                                            |
| ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| errors.GetV1MailboxesByMailboxIdSyncRunsBadRequestError | 400                                                     | application/json                                        |
| errors.MailmonDefaultError                              | 4XX, 5XX                                                | \*/\*                                                   |

## getV1MailboxesByMailboxIdObservability

Get mailbox observability

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getV1MailboxesByMailboxIdObservability" method="get" path="/v1/mailboxes/{mailboxId}/observability" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.getV1MailboxesByMailboxIdObservability({
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
import { getV1MailboxesByMailboxIdObservability } from "@mailmon.dev/sdk/funcs/get-v1-mailboxes-by-mailbox-id-observability.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await getV1MailboxesByMailboxIdObservability(mailmon, {
    mailboxId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("getV1MailboxesByMailboxIdObservability failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.GetV1MailboxesByMailboxIdObservabilityRequest](../../models/operations/get-v1-mailboxes-by-mailbox-id-observability-request.md)                                    | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetV1MailboxesByMailboxIdObservabilityResponse](../../models/operations/get-v1-mailboxes-by-mailbox-id-observability-response.md)\>**

### Errors

| Error Type                                                   | Status Code                                                  | Content Type                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| errors.GetV1MailboxesByMailboxIdObservabilityBadRequestError | 400                                                          | application/json                                             |
| errors.GetV1MailboxesByMailboxIdObservabilityNotFoundError   | 404                                                          | application/json                                             |
| errors.MailmonDefaultError                                   | 4XX, 5XX                                                     | \*/\*                                                        |

## postV1Replays

Create a mailbox event replay

### Example Usage

<!-- UsageSnippet language="typescript" operationID="postV1Replays" method="post" path="/v1/replays" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.postV1Replays({
    mailboxId: "<id>",
    webhookEndpointId: "<id>",
    startTime: "<value>",
    endTime: "<value>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { postV1Replays } from "@mailmon.dev/sdk/funcs/post-v1-replays.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await postV1Replays(mailmon, {
    mailboxId: "<id>",
    webhookEndpointId: "<id>",
    startTime: "<value>",
    endTime: "<value>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("postV1Replays failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.PostV1ReplaysRequest](../../models/operations/post-v1-replays-request.md)                                                                                          | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.PostV1ReplaysResponse](../../models/operations/post-v1-replays-response.md)\>**

### Errors

| Error Type                          | Status Code                         | Content Type                        |
| ----------------------------------- | ----------------------------------- | ----------------------------------- |
| errors.PostV1ReplaysBadRequestError | 400                                 | application/json                    |
| errors.ConflictError                | 409                                 | application/json                    |
| errors.MailmonDefaultError          | 4XX, 5XX                            | \*/\*                               |

## getV1ReplaysByReplayId

Get a replay

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getV1ReplaysByReplayId" method="get" path="/v1/replays/{replayId}" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.getV1ReplaysByReplayId({
    replayId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { getV1ReplaysByReplayId } from "@mailmon.dev/sdk/funcs/get-v1-replays-by-replay-id.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await getV1ReplaysByReplayId(mailmon, {
    replayId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("getV1ReplaysByReplayId failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.GetV1ReplaysByReplayIdRequest](../../models/operations/get-v1-replays-by-replay-id-request.md)                                                                     | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetV1ReplaysByReplayIdResponse](../../models/operations/get-v1-replays-by-replay-id-response.md)\>**

### Errors

| Error Type                                   | Status Code                                  | Content Type                                 |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| errors.GetV1ReplaysByReplayIdBadRequestError | 400                                          | application/json                             |
| errors.GetV1ReplaysByReplayIdNotFoundError   | 404                                          | application/json                             |
| errors.MailmonDefaultError                   | 4XX, 5XX                                     | \*/\*                                        |

## getV1Messages

List mailbox messages

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getV1Messages" method="get" path="/v1/messages" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.getV1Messages({
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
import { getV1Messages } from "@mailmon.dev/sdk/funcs/get-v1-messages.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await getV1Messages(mailmon, {
    mailboxId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("getV1Messages failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.GetV1MessagesRequest](../../models/operations/get-v1-messages-request.md)                                                                                          | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetV1MessagesResponse](../../models/operations/get-v1-messages-response.md)\>**

### Errors

| Error Type                          | Status Code                         | Content Type                        |
| ----------------------------------- | ----------------------------------- | ----------------------------------- |
| errors.GetV1MessagesBadRequestError | 400                                 | application/json                    |
| errors.MailmonDefaultError          | 4XX, 5XX                            | \*/\*                               |

## getV1MessagesByMessageId

Get a message

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getV1MessagesByMessageId" method="get" path="/v1/messages/{messageId}" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.getV1MessagesByMessageId({
    messageId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { getV1MessagesByMessageId } from "@mailmon.dev/sdk/funcs/get-v1-messages-by-message-id.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await getV1MessagesByMessageId(mailmon, {
    messageId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("getV1MessagesByMessageId failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.GetV1MessagesByMessageIdRequest](../../models/operations/get-v1-messages-by-message-id-request.md)                                                                 | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetV1MessagesByMessageIdResponse](../../models/operations/get-v1-messages-by-message-id-response.md)\>**

### Errors

| Error Type                                     | Status Code                                    | Content Type                                   |
| ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| errors.GetV1MessagesByMessageIdBadRequestError | 400                                            | application/json                               |
| errors.GetV1MessagesByMessageIdNotFoundError   | 404                                            | application/json                               |
| errors.MailmonDefaultError                     | 4XX, 5XX                                       | \*/\*                                          |

## getV1Threads

List mailbox threads

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getV1Threads" method="get" path="/v1/threads" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.getV1Threads({
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
import { getV1Threads } from "@mailmon.dev/sdk/funcs/get-v1-threads.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await getV1Threads(mailmon, {
    mailboxId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("getV1Threads failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.GetV1ThreadsRequest](../../models/operations/get-v1-threads-request.md)                                                                                            | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetV1ThreadsResponse](../../models/operations/get-v1-threads-response.md)\>**

### Errors

| Error Type                         | Status Code                        | Content Type                       |
| ---------------------------------- | ---------------------------------- | ---------------------------------- |
| errors.GetV1ThreadsBadRequestError | 400                                | application/json                   |
| errors.MailmonDefaultError         | 4XX, 5XX                           | \*/\*                              |

## getV1ThreadsByThreadId

Get a thread

### Example Usage

<!-- UsageSnippet language="typescript" operationID="getV1ThreadsByThreadId" method="get" path="/v1/threads/{threadId}" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.getV1ThreadsByThreadId({
    threadId: "<id>",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { getV1ThreadsByThreadId } from "@mailmon.dev/sdk/funcs/get-v1-threads-by-thread-id.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await getV1ThreadsByThreadId(mailmon, {
    threadId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("getV1ThreadsByThreadId failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.GetV1ThreadsByThreadIdRequest](../../models/operations/get-v1-threads-by-thread-id-request.md)                                                                     | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetV1ThreadsByThreadIdResponse](../../models/operations/get-v1-threads-by-thread-id-response.md)\>**

### Errors

| Error Type                                   | Status Code                                  | Content Type                                 |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| errors.GetV1ThreadsByThreadIdBadRequestError | 400                                          | application/json                             |
| errors.GetV1ThreadsByThreadIdNotFoundError   | 404                                          | application/json                             |
| errors.MailmonDefaultError                   | 4XX, 5XX                                     | \*/\*                                        |