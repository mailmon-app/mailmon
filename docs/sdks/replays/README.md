# Replays

## Overview

Mailbox event replay operations.

### Available Operations

* [create](#create) - Create a mailbox event replay
* [getById](#getbyid) - Get a replay

## create

Create a mailbox event replay

### Example Usage

<!-- UsageSnippet language="typescript" operationID="replays_create" method="post" path="/v1/replays" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.replays.create({
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
import { replaysCreate } from "@mailmon.dev/sdk/funcs/replays-create.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await replaysCreate(mailmon, {
    mailboxId: "<id>",
    webhookEndpointId: "<id>",
    startTime: "<value>",
    endTime: "<value>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("replaysCreate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [models.CreateReplayRequest](../../models/create-replay-request.md)                                                                                                            | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.Replay](../../models/replay.md)\>**

### Errors

| Error Type                 | Status Code                | Content Type               |
| -------------------------- | -------------------------- | -------------------------- |
| errors.ProblemDetailsError | 400, 409                   | application/json           |
| errors.MailmonDefaultError | 4XX, 5XX                   | \*/\*                      |

## getById

Get a replay

### Example Usage

<!-- UsageSnippet language="typescript" operationID="replays_get" method="get" path="/v1/replays/{replayId}" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.replays.getById({
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
import { replaysGetById } from "@mailmon.dev/sdk/funcs/replays-get-by-id.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await replaysGetById(mailmon, {
    replayId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("replaysGetById failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.ReplaysGetRequest](../../models/operations/replays-get-request.md)                                                                                                 | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.Replay](../../models/replay.md)\>**

### Errors

| Error Type                 | Status Code                | Content Type               |
| -------------------------- | -------------------------- | -------------------------- |
| errors.ProblemDetailsError | 400, 404                   | application/json           |
| errors.MailmonDefaultError | 4XX, 5XX                   | \*/\*                      |