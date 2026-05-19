<!-- Start SDK Example Usage [usage] -->
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
<!-- End SDK Example Usage [usage] -->