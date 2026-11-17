const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
const serviceKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function isAuthorized(request: Request): Promise<boolean> {
  const presentedKey = request.headers.get('x-tinavitrine-state-key') ?? '';
  if (presentedKey.length < 40 || presentedKey.length > 128 || !serviceKey || !supabaseUrl) return false;

  const keyHash = await sha256(presentedKey);
  const response = await fetch(
    `${supabaseUrl}/rest/v1/tinavitrine_access_keys?key_hash=eq.${encodeURIComponent(keyHash)}&select=key_hash&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  if (!response.ok) return false;
  const matches = await response.json() as Array<{ key_hash: string }>;
  return matches.length === 1;
}

function validState(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return ['users', 'sessions', 'products', 'socialAccounts', 'socialPosts', 'gateways', 'orders']
    .every((key) => Array.isArray(state[key])) && Boolean(state.roleMatrix && typeof state.roleMatrix === 'object');
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'GET' && request.method !== 'PUT') {
    return json({ error: 'method_not_allowed' }, 405);
  }
  if (!await isAuthorized(request)) return json({ error: 'unauthorized' }, 401);

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  const tableUrl = `${supabaseUrl}/rest/v1/tinavitrine_app_state`;

  if (request.method === 'GET') {
    const response = await fetch(`${tableUrl}?id=eq.main&select=state,version&limit=1`, { headers });
    if (!response.ok) return json({ error: 'state_read_failed' }, 503);
    const rows = await response.json() as Array<{ state: unknown; version: number }>;
    if (!rows.length) return json({ error: 'state_not_initialized' }, 404);
    return json({ state: rows[0].state, version: rows[0].version });
  }

  let body: { state?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!validState(body.state) || JSON.stringify(body.state).length > 10_000_000) {
    return json({ error: 'invalid_state' }, 400);
  }

  const expectedVersion = Number(request.headers.get('if-match'));
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    return json({ error: 'invalid_version' }, 400);
  }

  if (expectedVersion === 0) {
    const response = await fetch(tableUrl, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ id: 'main', state: body.state, version: 1 }),
    });
    if (response.status === 409) return json({ error: 'version_conflict' }, 409);
    if (!response.ok) return json({ error: 'state_write_failed' }, 503);
    return json({ version: 1 });
  }

  const nextVersion = expectedVersion + 1;
  const response = await fetch(
    `${tableUrl}?id=eq.main&version=eq.${expectedVersion}`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ state: body.state, version: nextVersion, updated_at: new Date().toISOString() }),
    },
  );
  if (!response.ok) return json({ error: 'state_write_failed' }, 503);
  const rows = await response.json() as Array<{ version: number }>;
  if (!rows.length) return json({ error: 'version_conflict' }, 409);
  return json({ version: rows[0].version });
});
