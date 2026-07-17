let cachedToken: string | null = null;
let tokenExpirationTime: number | null = null;

async function getCognitoToken(): Promise<string> {
  const now = Date.now();
  
  // Reuse the token if we already have one and it hasn't expired (55-minute cache)
  if (cachedToken && tokenExpirationTime && now < tokenExpirationTime) {
    return cachedToken;
  }

  const clientId = process.env.COGNITO_CLIENT_ID!;
  const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
  const tokenUrl = process.env.COGNITO_TOKEN_URL!;
  const scope = process.env.COGNITO_SCOPE!;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: scope,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Cognito token: ${response.statusText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpirationTime = now + (55 * 60 * 1000); // 55 minutes
  return cachedToken!;
}

export async function fetchInternalApi(endpointPath: string, options: RequestInit = {}) {
  const token = await getCognitoToken();
  const baseUrl = process.env.INTERNAL_API_URL!;
  const apiKey = process.env.INTERNAL_API_KEY!;

  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  };

  const response = await fetch(`${baseUrl}${endpointPath}`, {
    ...options,
    headers,
  });
  
  // We DO NOT throw an error here. We return the raw response 
  // so streetlives-api-service.ts can handle 404s and 500s normally!
  return response;
}