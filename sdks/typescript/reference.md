# Reference

<details><summary><code>client.<a href="/src/Client.ts">postV1MailboxesConnectSessions</a>({ ...params }) -> void</code></summary>
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

<details><summary><code>client.<a href="/src/Client.ts">postV1WebhookEndpoints</a>({ ...params }) -> void</code></summary>
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

<details><summary><code>client.<a href="/src/Client.ts">postV1WebhookEndpointsByEndpointIdSubscriptions</a>({ ...params }) -> void</code></summary>
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

<details><summary><code>client.<a href="/src/Client.ts">getV1MailboxesByMailboxIdSyncRuns</a>({ ...params }) -> void</code></summary>
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

<details><summary><code>client.<a href="/src/Client.ts">postV1Replays</a>({ ...params }) -> void</code></summary>
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

<details><summary><code>client.<a href="/src/Client.ts">getV1Messages</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.getV1Messages();
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

<details><summary><code>client.<a href="/src/Client.ts">getV1Threads</a>({ ...params }) -> void</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.getV1Threads();
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
