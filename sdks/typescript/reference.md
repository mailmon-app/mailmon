# Reference

<details><summary><code>client.<a href="/src/Client.ts">postV1MailboxesConnectSessions</a>({ ...params }) -> Mailmon.PostV1MailboxesConnectSessionsResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.postV1MailboxesConnectSessions({
  provider: "gmail",
  tenantExternalId: "tenantExternalId",
  mailboxExternalId: "mailboxExternalId",
  redirectUrl: "redirectUrl",
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.PostV1MailboxesConnectSessionsRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">postV1WebhookEndpoints</a>({ ...params }) -> Mailmon.PostV1WebhookEndpointsResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.postV1WebhookEndpoints({
  url: "url",
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.PostV1WebhookEndpointsRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">postV1WebhookEndpointsByEndpointIdSubscriptions</a>({ ...params }) -> Mailmon.PostV1WebhookEndpointsByEndpointIdSubscriptionsResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.postV1WebhookEndpointsByEndpointIdSubscriptions({
  endpointId: "endpointId",
  mailboxIds: ["mailboxIds"],
  eventTypes: ["message.created"],
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.PostV1WebhookEndpointsByEndpointIdSubscriptionsRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">getV1MailboxesByMailboxId</a>({ ...params }) -> Mailmon.GetV1MailboxesByMailboxIdResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.getV1MailboxesByMailboxId({
  mailboxId: "mailboxId",
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.GetV1MailboxesByMailboxIdRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">getV1MailboxesByMailboxIdSyncRuns</a>({ ...params }) -> Mailmon.GetV1MailboxesByMailboxIdSyncRunsResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.getV1MailboxesByMailboxIdSyncRuns({
  mailboxId: "mailboxId",
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.GetV1MailboxesByMailboxIdSyncRunsRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">getV1MailboxesByMailboxIdObservability</a>({ ...params }) -> Mailmon.GetV1MailboxesByMailboxIdObservabilityResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.getV1MailboxesByMailboxIdObservability({
  mailboxId: "mailboxId",
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.GetV1MailboxesByMailboxIdObservabilityRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">postV1Replays</a>({ ...params }) -> Mailmon.PostV1ReplaysResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.postV1Replays({
  mailboxId: "mailboxId",
  webhookEndpointId: "webhookEndpointId",
  startTime: "startTime",
  endTime: "endTime",
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.PostV1ReplaysRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">getV1ReplaysByReplayId</a>({ ...params }) -> Mailmon.GetV1ReplaysByReplayIdResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.getV1ReplaysByReplayId({
  replayId: "replayId",
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.GetV1ReplaysByReplayIdRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">getV1Messages</a>({ ...params }) -> Mailmon.GetV1MessagesResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.getV1Messages({
  mailboxId: "mailboxId",
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.GetV1MessagesRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">getV1MessagesByMessageId</a>({ ...params }) -> Mailmon.GetV1MessagesByMessageIdResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.getV1MessagesByMessageId({
  messageId: "messageId",
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.GetV1MessagesByMessageIdRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">getV1Threads</a>({ ...params }) -> Mailmon.GetV1ThreadsResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.getV1Threads({
  mailboxId: "mailboxId",
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.GetV1ThreadsRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">getV1ThreadsByThreadId</a>({ ...params }) -> Mailmon.GetV1ThreadsByThreadIdResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.getV1ThreadsByThreadId({
  threadId: "threadId",
});
```

</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Mailmon.GetV1ThreadsByThreadIdRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MailmonClient.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>
