import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sdkRoot = join(repoRoot, "sdks", "typescript");

const editFile = async (path, edit) => {
  const original = await readFile(path, "utf8");
  const updated = edit(original);

  if (updated !== original) {
    await writeFile(path, updated);
  }
};

const ensureIncludes = (source, needle, message) => {
  if (!source.includes(needle)) {
    throw new Error(message);
  }
};

const addAfter = (source, marker, insertion) => {
  if (source.includes(insertion)) {
    return source;
  }

  ensureIncludes(source, marker, `Unable to find marker: ${marker}`);
  return source.replace(marker, `${marker}${insertion}`);
};

const addBefore = (source, marker, insertion) => {
  if (source.includes(insertion)) {
    return source;
  }

  ensureIncludes(source, marker, `Unable to find marker: ${marker}`);
  return source.replace(marker, `${insertion}${marker}`);
};

await editFile(join(sdkRoot, "esm", "index.mjs"), (source) => {
  let updated = addAfter(
    source,
    `export * as Mailmon from "./api/index.mjs";\n`,
    `export * as webhooks from "./webhooks.mjs";\n`,
  );
  updated = addAfter(
    updated,
    `export { MailmonError, MailmonTimeoutError } from "./errors/index.mjs";\n`,
    `export { MailmonWebhookSignatureError } from "./webhooks.mjs";\n`,
  );

  return updated;
});

await editFile(join(sdkRoot, "esm", "index.d.mts"), (source) => {
  let updated = addAfter(
    source,
    `export * as Mailmon from "./api/index.mjs";\n`,
    `export * as webhooks from "./webhooks.mjs";\n`,
  );
  updated = addAfter(
    updated,
    `export { MailmonError, MailmonTimeoutError } from "./errors/index.mjs";\n`,
    `export { MailmonWebhookSignatureError } from "./webhooks.mjs";\nexport type { WebhookPayload, WebhookSignatureOptions } from "./webhooks.mjs";\n`,
  );

  return updated;
});

await editFile(join(sdkRoot, "esm", "Client.mjs"), (source) => {
  let updated = addAfter(
    source,
    `import * as errors from "./errors/index.mjs";\n`,
    `import * as webhooks from "./webhooks.mjs";\n`,
  );
  updated = addAfter(
    updated,
    `        this._options = normalizeClientOptionsWithAuth(options);\n`,
    `        this.webhooks = webhooks;\n`,
  );

  return updated;
});

await editFile(join(sdkRoot, "esm", "Client.d.mts"), (source) => {
  let updated = addAfter(
    source,
    `import * as core from "./core/index.mjs";\n`,
    `import * as webhooks from "./webhooks.mjs";\n`,
  );
  updated = addAfter(
    updated,
    `    protected readonly _options: NormalizedClientOptionsWithAuth<MailmonClient.Options>;\n`,
    `    readonly webhooks: typeof webhooks;\n`,
  );

  return updated;
});

await editFile(join(sdkRoot, "cjs", "index.js"), (source) => {
  let updated = source;
  if (!updated.includes("exports.webhooks =")) {
    updated = updated.replace(
      "exports.MailmonTimeoutError = exports.MailmonError = exports.MailmonEnvironment = exports.MailmonClient = exports.Mailmon = void 0;",
      "exports.MailmonWebhookSignatureError = exports.MailmonTimeoutError = exports.MailmonError = exports.MailmonEnvironment = exports.MailmonClient = exports.webhooks = exports.Mailmon = void 0;",
    );
    updated = addAfter(
      updated,
      `exports.Mailmon = __importStar(require("./api/index.js"));\n`,
      `exports.webhooks = __importStar(require("./webhooks.js"));\n`,
    );
  }
  updated = addBefore(
    updated,
    `__exportStar(require("./exports.js"), exports);\n`,
    `var webhooks_js_1 = require("./webhooks.js");\nObject.defineProperty(exports, "MailmonWebhookSignatureError", { enumerable: true, get: function () { return webhooks_js_1.MailmonWebhookSignatureError; } });\n`,
  );

  return updated;
});

await editFile(join(sdkRoot, "cjs", "index.d.ts"), (source) => {
  let updated = addAfter(
    source,
    `export * as Mailmon from "./api/index.js";\n`,
    `export * as webhooks from "./webhooks.js";\n`,
  );
  updated = addAfter(
    updated,
    `export { MailmonError, MailmonTimeoutError } from "./errors/index.js";\n`,
    `export { MailmonWebhookSignatureError } from "./webhooks.js";\nexport type { WebhookPayload, WebhookSignatureOptions } from "./webhooks.js";\n`,
  );

  return updated;
});

await editFile(join(sdkRoot, "cjs", "Client.js"), (source) => {
  let updated = addAfter(
    source,
    `const errors = __importStar(require("./errors/index.js"));\n`,
    `const webhooks = __importStar(require("./webhooks.js"));\n`,
  );
  updated = addAfter(
    updated,
    `        this._options = (0, BaseClient_js_1.normalizeClientOptionsWithAuth)(options);\n`,
    `        this.webhooks = webhooks;\n`,
  );

  return updated;
});

await editFile(join(sdkRoot, "cjs", "Client.d.ts"), (source) => {
  let updated = addAfter(
    source,
    `import * as core from "./core/index.js";\n`,
    `import * as webhooks from "./webhooks.js";\n`,
  );
  updated = addAfter(
    updated,
    `    protected readonly _options: NormalizedClientOptionsWithAuth<MailmonClient.Options>;\n`,
    `    readonly webhooks: typeof webhooks;\n`,
  );

  return updated;
});

await editFile(join(sdkRoot, "README.md"), (source) => {
  let updated = addAfter(
    source,
    `- [Advanced](#advanced)\n`,
    `  - [Webhook Signature Verification](#webhook-signature-verification)\n`,
  );
  updated = addAfter(
    updated,
    `## Advanced\n`,
    `
### Webhook Signature Verification

Use this helper on your server with the raw request body and the endpoint signing secret returned when the
Webhook Endpoint was created.

\`\`\`typescript
import { webhooks } from "@mailmon.dev/sdk";

const signature = request.headers["x-mailmon-signature"];
const secret = process.env.MAILMON_WEBHOOK_SECRET;

if (typeof signature !== "string" || secret === undefined) {
  throw new Error("Missing webhook signature or secret.");
}

const event = webhooks.constructEvent(rawRequestBody, signature, secret);
\`\`\`

\`constructEvent\` verifies the \`t=<timestamp>,v1=<hex_hmac>\` header with HMAC-SHA256, enforces a default
5 minute timestamp tolerance, and returns the parsed Mailbox Event JSON. Use
\`webhooks.verifySignature\` when you only need signature validation; it returns \`true\` or throws
\`MailmonWebhookSignatureError\`.
`,
  );

  return updated;
});
