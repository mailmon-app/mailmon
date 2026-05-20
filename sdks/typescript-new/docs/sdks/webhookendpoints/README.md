# WebhookEndpoints

## Overview

### Available Operations

- [create](#create) - Create a webhook endpoint
- [createSubscription](#createsubscription) - Create mailbox-scoped webhook subscriptions

## create

Create a webhook endpoint

### Example Usage

<!-- UsageSnippet language="typescript" operationID="webhook_endpoints_create" method="post" path="/v1/webhook-endpoints" -->

```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.webhookEndpoints.create({
    url: "https://well-off-mentor.biz",
  });

  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { MailmonCore } from "@mailmon.dev/sdk/core.js";
import { webhookEndpointsCreate } from "@mailmon.dev/sdk/funcs/webhook-endpoints-create.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await webhookEndpointsCreate(mailmon, {
    url: "https://well-off-mentor.biz",
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("webhookEndpointsCreate failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter              | Type                                                                                    | Required           | Description                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [models.CreateWebhookEndpointRequest](../../models/create-webhook-endpoint-request.md)  | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                          | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options) | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                           | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.WebhookEndpoint](../../models/webhook-endpoint.md)\>**

### Errors

| Error Type                 | Status Code | Content Type     |
| -------------------------- | ----------- | ---------------- |
| errors.ProblemDetailsError | 400         | application/json |
| errors.MailmonDefaultError | 4XX, 5XX    | \*/\*            |

## createSubscription

Create mailbox-scoped webhook subscriptions

### Example Usage

<!-- UsageSnippet language="typescript" operationID="webhook_endpoints_create_subscription" method="post" path="/v1/webhook-endpoints/{endpointId}/subscriptions" -->

```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.webhookEndpoints.createSubscription({
    endpointId: "<id>",
    body: {
      mailboxIds: ["<value 1>"],
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
import { webhookEndpointsCreateSubscription } from "@mailmon.dev/sdk/funcs/webhook-endpoints-create-subscription.js";

// Use `MailmonCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const mailmon = new MailmonCore({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const res = await webhookEndpointsCreateSubscription(mailmon, {
    endpointId: "<id>",
    body: {
      mailboxIds: ["<value 1>"],
      eventTypes: [],
    },
  });
  if (res.ok) {
    const { value: result } = res;
    console.log(result);
  } else {
    console.log("webhookEndpointsCreateSubscription failed:", res.error);
  }
}

run();
```

### Parameters

| Parameter              | Type                                                                                                                             | Required           | Description                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.WebhookEndpointsCreateSubscriptionRequest](../../models/operations/webhook-endpoints-create-subscription-request.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                                                                   | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)                                          | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                                                                    | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[models.WebhookEndpointSubscriptionList](../../models/webhook-endpoint-subscription-list.md)\>**

### Errors

| Error Type                 | Status Code | Content Type     |
| -------------------------- | ----------- | ---------------- |
| errors.ProblemDetailsError | 400, 404    | application/json |
| errors.MailmonDefaultError | 4XX, 5XX    | \*/\*            |
