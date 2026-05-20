# Threads

## Overview

Mailbox thread read operations.

### Available Operations

* [list](#list) - List mailbox threads
* [getById](#getbyid) - Get a thread

## list

List mailbox threads

### Example Usage

<!-- UsageSnippet language="typescript" operationID="threads_list" method="get" path="/v1/threads" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.threads.list({
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
import { threadsList } from "@mailmon.dev/sdk/funcs/threads-list.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await threadsList(mailmon, {
    mailboxId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    for await (const page of result) {
    console.log(page);
  }
  } else {
    console.log("threadsList failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.ThreadsListRequest](../../models/operations/threads-list-request.md)                                                                                               | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.ThreadsListResponse](../../models/operations/threads-list-response.md)\>**

### Errors

| Error Type                 | Status Code                | Content Type               |
| -------------------------- | -------------------------- | -------------------------- |
| errors.ProblemDetailsError | 400                        | application/json           |
| errors.MailmonDefaultError | 4XX, 5XX                   | \*/\*                      |

## getById

Get a thread

### Example Usage

<!-- UsageSnippet language="typescript" operationID="threads_get" method="get" path="/v1/threads/{threadId}" -->
```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.threads.getById({
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
import { threadsGetById } from "@mailmon.dev/sdk/funcs/threads-get-by-id.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await threadsGetById(mailmon, {
    threadId: "<id>",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("threadsGetById failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter                                                                                                                                                                      | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`                                                                                                                                                                      | [operations.ThreadsGetRequest](../../models/operations/threads-get-request.md)                                                                                                 | :heavy_check_mark:                                                                                                                                                             | The request object to use for the request.                                                                                                                                     |
| `options`                                                                                                                                                                      | RequestOptions                                                                                                                                                                 | :heavy_minus_sign:                                                                                                                                                             | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions`                                                                                                                                                         | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                                                                        | :heavy_minus_sign:                                                                                                                                                             | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`                                                                                                                                                              | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                                                                  | :heavy_minus_sign:                                                                                                                                                             | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.Thread](../../models/thread.md)\>**

### Errors

| Error Type                 | Status Code                | Content Type               |
| -------------------------- | -------------------------- | -------------------------- |
| errors.ProblemDetailsError | 400, 404                   | application/json           |
| errors.MailmonDefaultError | 4XX, 5XX                   | \*/\*                      |