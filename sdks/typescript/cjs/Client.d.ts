import * as Mailmon from "./api/index.js";
import type { BaseClientOptions, BaseRequestOptions } from "./BaseClient.js";
import { type NormalizedClientOptionsWithAuth } from "./BaseClient.js";
import * as core from "./core/index.js";
export declare namespace MailmonClient {
    type Options = BaseClientOptions;
    interface RequestOptions extends BaseRequestOptions {
    }
}
export declare class MailmonClient {
    protected readonly _options: NormalizedClientOptionsWithAuth<MailmonClient.Options>;
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
    postV1MailboxesConnectSessions(request: Mailmon.PostV1MailboxesConnectSessionsRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<void>;
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
    postV1WebhookEndpoints(request: Mailmon.PostV1WebhookEndpointsRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<void>;
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
    postV1WebhookEndpointsByEndpointIdSubscriptions(request: Mailmon.PostV1WebhookEndpointsByEndpointIdSubscriptionsRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<void>;
    private __postV1WebhookEndpointsByEndpointIdSubscriptions;
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
    getV1MailboxesByMailboxIdSyncRuns(request: Mailmon.GetV1MailboxesByMailboxIdSyncRunsRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<void>;
    private __getV1MailboxesByMailboxIdSyncRuns;
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
    postV1Replays(request: Mailmon.PostV1ReplaysRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<void>;
    private __postV1Replays;
    /**
     * @param {Mailmon.GetV1MessagesRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     *
     * @example
     *     await client.getV1Messages()
     */
    getV1Messages(request?: Mailmon.GetV1MessagesRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<void>;
    private __getV1Messages;
    /**
     * @param {Mailmon.GetV1ThreadsRequest} request
     * @param {MailmonClient.RequestOptions} requestOptions - Request-specific configuration.
     *
     * @throws {@link Mailmon.BadRequestError}
     *
     * @example
     *     await client.getV1Threads()
     */
    getV1Threads(request?: Mailmon.GetV1ThreadsRequest, requestOptions?: MailmonClient.RequestOptions): core.HttpResponsePromise<void>;
    private __getV1Threads;
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
