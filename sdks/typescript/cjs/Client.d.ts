import * as Mailmon from "./api/index.js";
import type { BaseClientOptions, BaseRequestOptions } from "./BaseClient.js";
import { type NormalizedClientOptionsWithAuth } from "./BaseClient.js";
import * as core from "./core/index.js";
import * as webhooks from "./webhooks.js";
export declare namespace MailmonClient {
    type Options = BaseClientOptions;
    interface RequestOptions extends BaseRequestOptions {
    }
}
export declare class MailmonClient {
    protected readonly _options: NormalizedClientOptionsWithAuth<MailmonClient.Options>;
    readonly webhooks: typeof webhooks;
    constructor(options: MailmonClient.Options);
    /**
     * @param {Mailmon.PostV1MailboxesConnectSessionsRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     *
     * @example
     *     await client.postV1MailboxesConnectSessions({
     *         provider: "gmail",
     *         tenantExternalId: "tenantExternalId",
     *         mailboxExternalId: "mailboxExternalId",
     *         redirectUrl: "redirectUrl"
     *     })
     */
    postV1MailboxesConnectSessions(request: Mailmon.PostV1MailboxesConnectSessionsRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.PostV1MailboxesConnectSessionsResponse>;
    private __postV1MailboxesConnectSessions;
    /**
     * @param {Mailmon.PostV1WebhookEndpointsRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     *
     * @example
     *     await client.postV1WebhookEndpoints({
     *         url: "url"
     *     })
     */
    postV1WebhookEndpoints(request: Mailmon.PostV1WebhookEndpointsRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.PostV1WebhookEndpointsResponse>;
    private __postV1WebhookEndpoints;
    /**
     * @param {Mailmon.PostV1WebhookEndpointsByEndpointIdSubscriptionsRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     * @throws {@link Mailmon.NotFoundError}
     *
     * @example
     *     await client.postV1WebhookEndpointsByEndpointIdSubscriptions({
     *         endpointId: "endpointId",
     *         mailboxIds: ["mailboxIds"],
     *         eventTypes: ["message.created"]
     *     })
     */
    postV1WebhookEndpointsByEndpointIdSubscriptions(request: Mailmon.PostV1WebhookEndpointsByEndpointIdSubscriptionsRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.PostV1WebhookEndpointsByEndpointIdSubscriptionsResponse>;
    private __postV1WebhookEndpointsByEndpointIdSubscriptions;
    /**
     * @param {Mailmon.GetV1MailboxesByMailboxIdRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     * @throws {@link Mailmon.NotFoundError}
     *
     * @example
     *     await client.getV1MailboxesByMailboxId({
     *         mailboxId: "mailboxId"
     *     })
     */
    getV1MailboxesByMailboxId(request: Mailmon.GetV1MailboxesByMailboxIdRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.GetV1MailboxesByMailboxIdResponse>;
    private __getV1MailboxesByMailboxId;
    /**
     * @param {Mailmon.GetV1MailboxesByMailboxIdSyncRunsRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     *
     * @example
     *     await client.getV1MailboxesByMailboxIdSyncRuns({
     *         mailboxId: "mailboxId"
     *     })
     */
    getV1MailboxesByMailboxIdSyncRuns(request: Mailmon.GetV1MailboxesByMailboxIdSyncRunsRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.GetV1MailboxesByMailboxIdSyncRunsResponse>;
    private __getV1MailboxesByMailboxIdSyncRuns;
    /**
     * @param {Mailmon.GetV1MailboxesByMailboxIdObservabilityRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     * @throws {@link Mailmon.NotFoundError}
     *
     * @example
     *     await client.getV1MailboxesByMailboxIdObservability({
     *         mailboxId: "mailboxId"
     *     })
     */
    getV1MailboxesByMailboxIdObservability(request: Mailmon.GetV1MailboxesByMailboxIdObservabilityRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.GetV1MailboxesByMailboxIdObservabilityResponse>;
    private __getV1MailboxesByMailboxIdObservability;
    /**
     * @param {Mailmon.PostV1ReplaysRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     * @throws {@link Mailmon.ConflictError}
     *
     * @example
     *     await client.postV1Replays({
     *         mailboxId: "mailboxId",
     *         webhookEndpointId: "webhookEndpointId",
     *         startTime: "startTime",
     *         endTime: "endTime"
     *     })
     */
    postV1Replays(request: Mailmon.PostV1ReplaysRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.PostV1ReplaysResponse>;
    private __postV1Replays;
    /**
     * @param {Mailmon.GetV1ReplaysByReplayIdRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     * @throws {@link Mailmon.NotFoundError}
     *
     * @example
     *     await client.getV1ReplaysByReplayId({
     *         replayId: "replayId"
     *     })
     */
    getV1ReplaysByReplayId(request: Mailmon.GetV1ReplaysByReplayIdRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.GetV1ReplaysByReplayIdResponse>;
    private __getV1ReplaysByReplayId;
    /**
     * @param {Mailmon.GetV1MessagesRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     *
     * @example
     *     await client.getV1Messages({
     *         mailboxId: "mailboxId"
     *     })
     */
    getV1Messages(request: Mailmon.GetV1MessagesRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.GetV1MessagesResponse>;
    private __getV1Messages;
    /**
     * @param {Mailmon.GetV1MessagesByMessageIdRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     * @throws {@link Mailmon.NotFoundError}
     *
     * @example
     *     await client.getV1MessagesByMessageId({
     *         messageId: "messageId"
     *     })
     */
    getV1MessagesByMessageId(request: Mailmon.GetV1MessagesByMessageIdRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.GetV1MessagesByMessageIdResponse>;
    private __getV1MessagesByMessageId;
    /**
     * @param {Mailmon.GetV1ThreadsRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     *
     * @example
     *     await client.getV1Threads({
     *         mailboxId: "mailboxId"
     *     })
     */
    getV1Threads(request: Mailmon.GetV1ThreadsRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.GetV1ThreadsResponse>;
    private __getV1Threads;
    /**
     * @param {Mailmon.GetV1ThreadsByThreadIdRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     * @throws {@link Mailmon.NotFoundError}
     *
     * @example
     *     await client.getV1ThreadsByThreadId({
     *         threadId: "threadId"
     *     })
     */
    getV1ThreadsByThreadId(request: Mailmon.GetV1ThreadsByThreadIdRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<Mailmon.GetV1ThreadsByThreadIdResponse>;
    private __getV1ThreadsByThreadId;
    /**
     * Make a passthrough request using the SDK's configured auth, retry, logging, etc.
     * This is useful for making requests to endpoints not yet supported in the SDK.
     * The input can be a URL string, URL object, or Request object. Relative paths are resolved against the configured base URL.
     *
     * @param {Request | string | URL} input - The URL, path, or Request object.
     * @param {RequestInit} init - Standard fetch RequestInit options.
     * @param {core.PassthroughRequest.RequestOptions} requestOptions - Per-request overrides (timeout, retries, headers, abort signal).
     * @returns {Promise<Response>} A standard Response object.
     */
    fetch(input: Request | string | URL, init?: RequestInit, requestOptions?: core.PassthroughRequest.RequestOptions): Promise<Response>;
}
