export interface GmailJsonResponse {
  readonly response: Response;
  readonly responseBody: unknown;
}

export interface GmailHttpClient {
  readonly getJson: (params: {
    readonly accessToken: string;
    readonly pathname: string;
    readonly searchParams?: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>;
  }) => Promise<GmailJsonResponse>;
  readonly postJson: (params: {
    readonly accessToken: string;
    readonly body: unknown;
    readonly pathname: string;
  }) => Promise<GmailJsonResponse>;
}

const trimTrailingSlash = (value: string) => {
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const createFetchUrl = (
  apiBaseUrl: string,
  pathname: string,
  params: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
) => {
  const url = new URL(`${trimTrailingSlash(apiBaseUrl)}${pathname}`);

  for (const key of Object.keys(params)) {
    const value = params[key];

    if (value === undefined) {
      continue;
    }

    if (typeof value !== "string") {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }

    url.searchParams.set(key, value);
  }

  return url;
};

export const createGmailHttpClient = (config: {
  readonly apiBaseUrl: string;
  readonly fetchImpl: typeof fetch;
}): GmailHttpClient => {
  const getJson: GmailHttpClient["getJson"] = async (params) => {
    const response = await config.fetchImpl(
      createFetchUrl(config.apiBaseUrl, params.pathname, params.searchParams ?? {}),
      {
        headers: {
          authorization: `Bearer ${params.accessToken}`,
        },
      },
    );

    return {
      response,
      responseBody: await response.json().catch(() => null),
    };
  };

  const postJson: GmailHttpClient["postJson"] = async (params) => {
    const response = await config.fetchImpl(
      createFetchUrl(config.apiBaseUrl, params.pathname, {}),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${params.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(params.body),
      },
    );

    return {
      response,
      responseBody: await response.json(),
    };
  };

  return {
    getJson,
    postJson,
  };
};
