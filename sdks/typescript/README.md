# @mailmon.dev/sdk

Developer-friendly & type-safe Typescript SDK specifically catered to leverage _@mailmon.dev/sdk\_ API.

[![Built by Speakeasy](https://img.shields.io/badge/Built_by-SPEAKEASY-374151?style=for-the-badge&labelColor=f3f4f6)](https://www.speakeasy.com/?utm_source=@mailmon-dev/sdk&utm_campaign=typescript)
[![License: Apache-2.0](https://img.shields.io/badge/LICENSE_//_Apache--2.0-3b5bdb?style=for-the-badge&labelColor=eff6ff)](https://opensource.org/licenses/Apache-2.0)

<!-- Start Summary [summary] -->

## Summary

Mailmon API: Development documentation

<!-- End Summary [summary] -->

<!-- Start Table of Contents [toc] -->

## Table of Contents

<!-- $toc-max-depth=2 -->

- [@mailmon.dev/sdk](#mailmondevsdk)
  - [SDK Installation](#sdk-installation)
  - [Requirements](#requirements)
  - [SDK Example Usage](#sdk-example-usage)
  - [Authentication](#authentication)
  - [Available Resources and Operations](#available-resources-and-operations)
  - [Standalone functions](#standalone-functions)
  - [Pagination](#pagination)
  - [Retries](#retries)
  - [Error Handling](#error-handling)
  - [Server Selection](#server-selection)
  - [Custom HTTP Client](#custom-http-client)
  - [Debugging](#debugging)
  - [Advanced](#advanced)
- [Development](#development)
  - [Maturity](#maturity)
  - [Contributions](#contributions)

<!-- End Table of Contents [toc] -->

<!-- Start SDK Installation [installation] -->

## SDK Installation

> [!TIP]
> To finish publishing your SDK to npm and others you must [run your first generation action](https://www.speakeasy.com/docs/github-setup#step-by-step-guide).

The SDK can be installed with either [npm](https://www.npmjs.com/), [pnpm](https://pnpm.io/), [bun](https://bun.sh/) or [yarn](https://classic.yarnpkg.com/en/) package managers.

### NPM

```bash
npm add <UNSET>
```

### PNPM

```bash
pnpm add <UNSET>
```

### Bun

```bash
bun add <UNSET>
```

### Yarn

```bash
yarn add <UNSET>
```

> [!NOTE]
> This package is published as an ES Module (ESM) only. For applications using
> CommonJS, use `await import()` to import and use this package.

<!-- End SDK Installation [installation] -->

<!-- Start Requirements [requirements] -->

## Requirements

For supported JavaScript runtimes, please consult [RUNTIMES.md](RUNTIMES.md).

<!-- End Requirements [requirements] -->

<!-- Start SDK Example Usage [usage] -->

## SDK Example Usage

### Example

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

<!-- End SDK Example Usage [usage] -->

<!-- Start Authentication [security] -->

## Authentication

### Per-Client Security Schemes

This SDK supports the following security scheme globally:

| Name         | Type | Scheme      | Environment Variable  |
| ------------ | ---- | ----------- | --------------------- |
| `bearerAuth` | http | HTTP Bearer | `MAILMON_BEARER_AUTH` |

To authenticate with the API the `bearerAuth` parameter must be set when initializing the SDK client instance. For example:

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

<!-- End Authentication [security] -->

<!-- Start Available Resources and Operations [operations] -->

## Available Resources and Operations

<details open>
<summary>Available methods</summary>

### [Mailboxes](docs/sdks/mailboxes/README.md)

- [createConnectSession](docs/sdks/mailboxes/README.md#createconnectsession) - Create a mailbox connect session
- [getById](docs/sdks/mailboxes/README.md#getbyid) - Get a mailbox
- [listSyncRuns](docs/sdks/mailboxes/README.md#listsyncruns) - List mailbox sync runs
- [getObservability](docs/sdks/mailboxes/README.md#getobservability) - Get mailbox observability

### [Messages](docs/sdks/messages/README.md)

- [list](docs/sdks/messages/README.md#list) - List mailbox messages
- [getById](docs/sdks/messages/README.md#getbyid) - Get a message

### [Replays](docs/sdks/replays/README.md)

- [create](docs/sdks/replays/README.md#create) - Create a mailbox event replay
- [getById](docs/sdks/replays/README.md#getbyid) - Get a replay

### [Threads](docs/sdks/threads/README.md)

- [list](docs/sdks/threads/README.md#list) - List mailbox threads
- [getById](docs/sdks/threads/README.md#getbyid) - Get a thread

### [WebhookEndpoints](docs/sdks/webhookendpoints/README.md)

- [create](docs/sdks/webhookendpoints/README.md#create) - Create a webhook endpoint
- [createSubscription](docs/sdks/webhookendpoints/README.md#createsubscription) - Create mailbox-scoped webhook subscriptions

</details>
<!-- End Available Resources and Operations [operations] -->

<!-- Start Standalone functions [standalone-funcs] -->

## Standalone functions

All the methods listed above are available as standalone functions. These
functions are ideal for use in applications running in the browser, serverless
runtimes or other environments where application bundle size is a primary
concern. When using a bundler to build your application, all unused
functionality will be either excluded from the final bundle or tree-shaken away.

To read more about standalone functions, check [FUNCTIONS.md](./FUNCTIONS.md).

<details>

<summary>Available standalone functions</summary>

- [`mailboxesCreateConnectSession`](docs/sdks/mailboxes/README.md#createconnectsession) - Create a mailbox connect session
- [`mailboxesGetById`](docs/sdks/mailboxes/README.md#getbyid) - Get a mailbox
- [`mailboxesGetObservability`](docs/sdks/mailboxes/README.md#getobservability) - Get mailbox observability
- [`mailboxesListSyncRuns`](docs/sdks/mailboxes/README.md#listsyncruns) - List mailbox sync runs
- [`messagesGetById`](docs/sdks/messages/README.md#getbyid) - Get a message
- [`messagesList`](docs/sdks/messages/README.md#list) - List mailbox messages
- [`replaysCreate`](docs/sdks/replays/README.md#create) - Create a mailbox event replay
- [`replaysGetById`](docs/sdks/replays/README.md#getbyid) - Get a replay
- [`threadsGetById`](docs/sdks/threads/README.md#getbyid) - Get a thread
- [`threadsList`](docs/sdks/threads/README.md#list) - List mailbox threads
- [`webhookEndpointsCreate`](docs/sdks/webhookendpoints/README.md#create) - Create a webhook endpoint
- [`webhookEndpointsCreateSubscription`](docs/sdks/webhookendpoints/README.md#createsubscription) - Create mailbox-scoped webhook subscriptions

</details>
<!-- End Standalone functions [standalone-funcs] -->

<!-- Start Pagination [pagination] -->

## Pagination

Some of the endpoints in this SDK support pagination. To use pagination, you
make your SDK calls as usual, but the returned response object will also be an
async iterable that can be consumed using the [`for await...of`][for-await-of]
syntax.

[for-await-of]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of

Here's an example of one such pagination call:

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

<!-- End Pagination [pagination] -->

<!-- Start Retries [retries] -->

## Retries

Some of the endpoints in this SDK support retries. If you use the SDK without any configuration, it will fall back to the default retry strategy provided by the API. However, the default retry strategy can be overridden on a per-operation basis, or across the entire SDK.

To change the default retry strategy for a single API call, simply provide a retryConfig object to the call:

```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  const result = await mailmon.mailboxes.createConnectSession(
    {
      provider: "gmail",
      tenantExternalId: "<id>",
      mailboxExternalId: "<id>",
      redirectUrl: "https://courteous-valley.name",
    },
    {
      retries: {
        strategy: "backoff",
        backoff: {
          initialInterval: 1,
          maxInterval: 50,
          exponent: 1.1,
          maxElapsedTime: 100,
        },
        retryConnectionErrors: false,
      },
    },
  );

  console.log(result);
}

run();
```

If you'd like to override the default retry strategy for all operations that support retries, you can provide a retryConfig at SDK initialization:

```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  retryConfig: {
    strategy: "backoff",
    backoff: {
      initialInterval: 1,
      maxInterval: 50,
      exponent: 1.1,
      maxElapsedTime: 100,
    },
    retryConnectionErrors: false,
  },
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

<!-- End Retries [retries] -->

<!-- Start Error Handling [errors] -->

## Error Handling

[`MailmonError`](./src/models/errors/mailmon-error.ts) is the base class for all HTTP error responses. It has the following properties:

| Property            | Type       | Description                                                                             |
| ------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `error.message`     | `string`   | Error message                                                                           |
| `error.statusCode`  | `number`   | HTTP response status code eg `404`                                                      |
| `error.headers`     | `Headers`  | HTTP response headers                                                                   |
| `error.body`        | `string`   | HTTP body. Can be empty string if no body is returned.                                  |
| `error.rawResponse` | `Response` | Raw HTTP response                                                                       |
| `error.data$`       |            | Optional. Some errors may contain structured data. [See Error Classes](#error-classes). |

### Example

```typescript
import { Mailmon } from "@mailmon.dev/sdk";
import * as errors from "@mailmon.dev/sdk/models/errors";

const mailmon = new Mailmon({
  bearerAuth: process.env["MAILMON_BEARER_AUTH"] ?? "",
});

async function run() {
  try {
    const result = await mailmon.mailboxes.createConnectSession({
      provider: "gmail",
      tenantExternalId: "<id>",
      mailboxExternalId: "<id>",
      redirectUrl: "https://courteous-valley.name",
    });

    console.log(result);
  } catch (error) {
    // The base class for HTTP error responses
    if (error instanceof errors.MailmonError) {
      console.log(error.message);
      console.log(error.statusCode);
      console.log(error.body);
      console.log(error.headers);

      // Depending on the method different errors may be thrown
      if (error instanceof errors.ProblemDetailsError) {
        console.log(error.data$.type); // string
        console.log(error.data$.title); // string
        console.log(error.data$.status); // number
        console.log(error.data$.code); // string
        console.log(error.data$.detail); // string
      }
    }
  }
}

run();
```

### Error Classes

**Primary errors:**

- [`MailmonError`](./src/models/errors/mailmon-error.ts): The base class for HTTP error responses.
  - [`ProblemDetailsError`](./src/models/errors/problem-details-error.ts): Invalid request.

<details><summary>Less common errors (6)</summary>

<br />

**Network errors:**

- [`ConnectionError`](./src/models/errors/http-client-errors.ts): HTTP client was unable to make a request to a server.
- [`RequestTimeoutError`](./src/models/errors/http-client-errors.ts): HTTP request timed out due to an AbortSignal signal.
- [`RequestAbortedError`](./src/models/errors/http-client-errors.ts): HTTP request was aborted by the client.
- [`InvalidRequestError`](./src/models/errors/http-client-errors.ts): Any input used to create a request is invalid.
- [`UnexpectedClientError`](./src/models/errors/http-client-errors.ts): Unrecognised or unexpected error.

**Inherit from [`MailmonError`](./src/models/errors/mailmon-error.ts)**:

- [`ResponseValidationError`](./src/models/errors/response-validation-error.ts): Type mismatch between the data returned from the server and the structure expected by the SDK. See `error.rawValue` for the raw value and `error.pretty()` for a nicely formatted multi-line string.

</details>
<!-- End Error Handling [errors] -->

<!-- Start Server Selection [server] -->

## Server Selection

### Select Server by Index

You can override the default server globally by passing a server index to the `serverIdx: number` optional parameter when initializing the SDK client instance. The selected server will then be used as the default on the operations that use it. This table lists the indexes associated with the available servers:

| #   | Server                    | Description       |
| --- | ------------------------- | ----------------- |
| 0   | `https://api.mailmon.dev` | Production        |
| 1   | `http://localhost:3000`   | Local development |

#### Example

```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  serverIdx: 0,
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

### Override Server URL Per-Client

The default server can also be overridden globally by passing a URL to the `serverURL: string` optional parameter when initializing the SDK client instance. For example:

```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const mailmon = new Mailmon({
  serverURL: "http://localhost:3000",
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

<!-- End Server Selection [server] -->

<!-- Start Custom HTTP Client [http-client] -->

## Custom HTTP Client

The TypeScript SDK makes API calls using an `HTTPClient` that wraps the native
[Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API). This
client is a thin wrapper around `fetch` and provides the ability to attach hooks
around the request lifecycle that can be used to modify the request or handle
errors and response.

The `HTTPClient` constructor takes an optional `fetcher` argument that can be
used to integrate a third-party HTTP client or when writing tests to mock out
the HTTP client and feed in fixtures.

The following example shows how to:

- route requests through a proxy server using [undici](https://www.npmjs.com/package/undici)'s ProxyAgent
- use the `"beforeRequest"` hook to add a custom header and a timeout to requests
- use the `"requestError"` hook to log errors

```typescript
import { Mailmon } from "@mailmon.dev/sdk";
import { ProxyAgent } from "undici";
import { HTTPClient } from "@mailmon.dev/sdk/lib/http";

const dispatcher = new ProxyAgent("http://proxy.example.com:8080");

const httpClient = new HTTPClient({
  // 'fetcher' takes a function that has the same signature as native 'fetch'.
  fetcher: (input, init) =>
    // 'dispatcher' is specific to undici and not part of the standard Fetch API.
    fetch(input, { ...init, dispatcher } as RequestInit),
});

httpClient.addHook("beforeRequest", (request) => {
  const nextRequest = new Request(request, {
    signal: request.signal || AbortSignal.timeout(5000),
  });

  nextRequest.headers.set("x-custom-header", "custom value");

  return nextRequest;
});

httpClient.addHook("requestError", (error, request) => {
  console.group("Request Error");
  console.log("Reason:", `${error}`);
  console.log("Endpoint:", `${request.method} ${request.url}`);
  console.groupEnd();
});

const sdk = new Mailmon({ httpClient: httpClient });
```

<!-- End Custom HTTP Client [http-client] -->

<!-- Start Debugging [debug] -->

## Debugging

You can setup your SDK to emit debug logs for SDK requests and responses.

You can pass a logger that matches `console`'s interface as an SDK option.

> [!WARNING]
> Beware that debug logging will reveal secrets, like API tokens in headers, in log messages printed to a console or files. It's recommended to use this feature only during local development and not in production.

```typescript
import { Mailmon } from "@mailmon.dev/sdk";

const sdk = new Mailmon({ debugLogger: console });
```

You can also enable a default debug logger by setting an environment variable `MAILMON_DEBUG` to true.

<!-- End Debugging [debug] -->

<!-- Placeholder for Future Speakeasy SDK Sections -->

## Advanced

### Webhook Signature Verification

Use this helper on your server with the raw request body and the endpoint signing secret returned when the Webhook Endpoint was created.

```typescript
import { webhooks, type WebhookEventEnvelope } from "@mailmon.dev/sdk";

const signature = request.headers["x-mailmon-signature"];
const secret = process.env.MAILMON_WEBHOOK_SECRET;

if (typeof signature !== "string" || secret === undefined) {
  throw new Error("Missing webhook signature or secret.");
}

const event: WebhookEventEnvelope = webhooks.constructEvent(rawRequestBody, signature, secret);
```

`constructEvent` verifies the `t=<timestamp>,v1=<hex_hmac>` header with HMAC-SHA256, enforces a default 5 minute timestamp tolerance, and returns the parsed Mailbox Event JSON. Use `webhooks.verifySignature` when you only need signature validation; it returns `true` or throws `MailmonWebhookSignatureError`.

# Development

## Maturity

This SDK is in beta, and there may be breaking changes between versions without a major version update. Therefore, we recommend pinning usage
to a specific package version. This way, you can install the same version each time without breaking changes unless you are intentionally
looking for the latest version.

## Contributions

While we value open-source contributions to this SDK, this library is generated programmatically. Any manual changes added to internal files will be overwritten on the next generation.
We look forward to hearing your feedback. Feel free to open a PR or an issue with a proof of concept and we'll do our best to include it in a future release.

### SDK Created by [Speakeasy](https://www.speakeasy.com/?utm_source=@mailmon-dev/sdk&utm_campaign=typescript)
