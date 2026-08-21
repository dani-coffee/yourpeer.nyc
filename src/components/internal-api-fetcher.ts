let cachedToken: string | null = null;
let tokenExpirationTime: number | null = null;
let tokenPromise: Promise<string> | null = null;

async function getCognitoToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && tokenExpirationTime && now < tokenExpirationTime) {
    return cachedToken;
  }

  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    try {
      const clientId = process.env.COGNITO_CLIENT_ID!;
      const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
      const tokenUrl = process.env.COGNITO_TOKEN_URL!;
      const scope = process.env.COGNITO_SCOPE!;

      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
        "base64",
      );

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: scope,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch Cognito token: ${response.statusText}`,
        );
      }

      const data = await response.json();
      cachedToken = data.access_token;

      const expiresInSeconds = data.expires_in || 3600;
      tokenExpirationTime = now + (expiresInSeconds - 300) * 1000;

      return cachedToken!;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

export async function fetchInternalApi(
  endpointPath: string,
  options: RequestInit = {},
) {
  // EXPLICIT TEST BYPASS: Only true when Playwright runs the app locally.
  if (process.env.IS_PLAYWRIGHT_E2E === "true") {
    const fallbackUrl =
      process.env.NEXT_PUBLIC_GO_GETTA_PROD_URL || "http://localhost:4000";
    return fetch(`${fallbackUrl}${endpointPath}`, options);
  }

  const baseUrl = process.env.INTERNAL_API_URL;
  const apiKey = process.env.INTERNAL_API_KEY;

  // STRICT FAIL-CLOSED: If variables are missing in prod, crash immediately.
  if (!baseUrl || !apiKey) {
    throw new Error(
      "CRITICAL: Missing internal API configuration. Cannot route traffic.",
    );
  }
  const token = await getCognitoToken();
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("x-api-key", apiKey);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}${endpointPath}`, {
    ...options,
    headers,
  });

  return response;
}
