import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import {
  createInitialDb,
  databaseRequestContext,
  getDb,
  roleHasPermission,
  sanitizeUser,
  saveDb,
  verifyPassword,
  hashPassword,
} from './server/db.ts';
import { mapProductResearchError, researchProductFromImage, researchProductWithTavily } from './server/ai.ts';
import type {
  DatabaseSchema,
  FacebookTargetType,
  OrderItemRecord,
  OrderRecord,
  PermissionKey,
  ProductRecord,
  Role,
  RolePermissionsMap,
  SessionRecord,
  StoredUser,
} from './server/types.ts';

const PORT = 3000;
const SESSION_COOKIE = 'vp_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const rateLimitBuckets = new Map<string, { startedAt: number; count: number }>();

function rateLimit(req: Request, res: Response, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucketKey = `${key}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  const current = rateLimitBuckets.get(bucketKey);
  const bucket = !current || now - current.startedAt >= windowMs
    ? { startedAt: now, count: 0 }
    : current;
  bucket.count += 1;
  rateLimitBuckets.set(bucketKey, bucket);
  if (rateLimitBuckets.size > 5000) {
    for (const [storedKey, storedBucket] of rateLimitBuckets) {
      if (now - storedBucket.startedAt >= windowMs) rateLimitBuckets.delete(storedKey);
    }
  }
  if (bucket.count <= limit) return false;
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil((windowMs - (now - bucket.startedAt)) / 1000))));
  res.status(429).json({ error: 'Muitas tentativas. Aguarde um pouco e tente novamente.' });
  return true;
}

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomBytes(32).toString('hex'));

class PersistentStateError extends Error {
  constructor(message: string, readonly conflict = false) {
    super(message);
  }
}

function stateApiHeaders(): Record<string, string> {
  const apiKey = process.env.SUPABASE_ANON_KEY?.trim() || '';
  const stateKey = process.env.TINAVITRINE_STATE_KEY?.trim() || '';
  if (!apiKey || !stateKey) throw new PersistentStateError('Persistent store is not configured.');
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    'x-tinavitrine-state-key': stateKey,
  };
}

function stateApiUrl(): string {
  const url = process.env.TINAVITRINE_STATE_API_URL?.trim() || '';
  if (!url.startsWith('https://')) throw new PersistentStateError('Persistent store URL is not configured.');
  return url;
}

async function readPersistentState(): Promise<{ db: DatabaseSchema; version: number }> {
  const response = await fetch(stateApiUrl(), { headers: stateApiHeaders(), cache: 'no-store' });
  const body = await response.json().catch(() => ({})) as {
    state?: DatabaseSchema;
    version?: number;
    error?: string;
  };
  if (response.status === 404 && body.error === 'state_not_initialized') {
    const seeded = createInitialDb();
    const initializeResponse = await fetch(stateApiUrl(), {
      method: 'PUT',
      headers: { ...stateApiHeaders(), 'Content-Type': 'application/json', 'If-Match': '0' },
      body: JSON.stringify({ state: seeded }),
      cache: 'no-store',
    });
    if (initializeResponse.status === 409) return readPersistentState();
    const initialized = await initializeResponse.json().catch(() => ({})) as { version?: number };
    if (!initializeResponse.ok || !initialized.version) {
      throw new PersistentStateError('Persistent store could not be initialized.');
    }
    return { db: seeded, version: initialized.version };
  }
  if (!response.ok || !body.state || !Number.isInteger(body.version)) {
    throw new PersistentStateError('Persistent store could not be read.');
  }
  return { db: body.state, version: body.version as number };
}

async function writePersistentState(db: DatabaseSchema, expectedVersion: number): Promise<number> {
  const response = await fetch(stateApiUrl(), {
    method: 'PUT',
    headers: {
      ...stateApiHeaders(),
      'Content-Type': 'application/json',
      'If-Match': String(expectedVersion),
    },
    body: JSON.stringify({ state: db }),
    cache: 'no-store',
  });
  if (response.status === 409) throw new PersistentStateError('Persistent state changed during this request.', true);
  const body = await response.json().catch(() => ({})) as { version?: number };
  if (!response.ok || !Number.isInteger(body.version)) {
    throw new PersistentStateError('Persistent state could not be saved.');
  }
  return body.version as number;
}

function usePersistentState(app: express.Express) {
  app.use('/api', async (req, res, next) => {
    if (process.env.VERCEL !== '1' || req.path === '/health') return next();
    try {
      const loaded = await readPersistentState();
      const context = { ...loaded, dirty: false };
      const originalEnd = res.end.bind(res);
      let responseArgs: unknown[] | null = null;
      let writeStarted = false;
      res.end = ((...args: unknown[]) => {
        if (!context.dirty) return originalEnd(...args as Parameters<typeof originalEnd>);
        if (writeStarted) return res;
        writeStarted = true;
        responseArgs = args;
        void writePersistentState(context.db, context.version).then((version) => {
          context.version = version;
          context.dirty = false;
          if (responseArgs) originalEnd(...responseArgs as Parameters<typeof originalEnd>);
        }).catch((error: unknown) => {
          res.statusCode = error instanceof PersistentStateError && error.conflict ? 409 : 503;
          res.removeHeader('Content-Length');
          res.removeHeader('ETag');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          originalEnd(JSON.stringify({ error: res.statusCode === 409
            ? 'Os dados mudaram durante esta operação. Atualize e tente novamente.'
            : 'Não foi possível salvar os dados agora. Tente novamente.' }));
        });
        return res;
      }) as Response['end'];
      databaseRequestContext.run(context, next);
    } catch {
      return res.status(503).json({ error: 'O armazenamento persistente está indisponível.' });
    }
  });
}

function getStripeKeyInfo(apiKey: string): { mode: 'production' | 'sandbox'; prefix: string } | null {
  const match = /^(sk|rk)_(live|test)_/.exec(apiKey);
  if (!match) return null;
  return {
    mode: match[2] === 'live' ? 'production' : 'sandbox',
    prefix: `${match[1]}_${match[2]}`,
  };
}

function getPixCopyPaste(): string {
  return process.env.PIX_COPY_PASTE?.trim() || '';
}

function hasPixCopyPaste(payload: string): boolean {
  const normalized = payload.trim();
  return normalized.startsWith('000201') && /6304[0-9A-F]{4}$/i.test(normalized);
}

interface AuthContext {
  session: SessionRecord | null;
  realUser: StoredUser | null;
  effectiveUser: StoredUser | null;
  effectiveRole: Role;
  isImpersonating: boolean;
  testingRole: Role | null;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    let val = '';
    try {
      val = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      continue;
    }
    if (key) out[key] = val;
  }
  return out;
}

function resolveAuth(req: Request, db: DatabaseSchema, overrideToken?: string): AuthContext {
  const cookies = parseCookies(req.headers.cookie);
  const token = overrideToken || cookies[SESSION_COOKIE] || '';

  if (!token) {
    return {
      session: null,
      realUser: null,
      effectiveUser: null,
      effectiveRole: 'guest',
      isImpersonating: false,
      testingRole: null,
    };
  }

  const tokenHash = hashSessionToken(token);
  const session = db.sessions.find((s) => s.token === tokenHash) ?? null;
  if (!session) {
    return {
      session: null,
      realUser: null,
      effectiveUser: null,
      effectiveRole: 'guest',
      isImpersonating: false,
      testingRole: null,
    };
  }

  const createdAt = Date.parse(session.createdAt);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > SESSION_MAX_AGE_MS) {
    return {
      session: null,
      realUser: null,
      effectiveUser: null,
      effectiveRole: 'guest',
      isImpersonating: false,
      testingRole: null,
    };
  }

  const realUser = db.users.find((u) => u.id === session.realUserId) ?? null;
  if (!realUser || realUser.banned) {
    return {
      session: null,
      realUser: null,
      effectiveUser: null,
      effectiveRole: 'guest',
      isImpersonating: false,
      testingRole: null,
    };
  }

  if (realUser.role === 'creator' && session.testingRole) {
    const testingRole = session.testingRole;
    return {
      session,
      realUser,
      effectiveUser: testingRole === 'guest' ? null : realUser,
      effectiveRole: testingRole,
      isImpersonating: false,
      testingRole,
    };
  }

  if (realUser.role === 'creator' && session.impersonatedUserId) {
    const impUser = db.users.find((u) => u.id === session.impersonatedUserId) ?? null;
    if (impUser) {
      return {
        session,
        realUser,
        effectiveUser: impUser,
        effectiveRole: impUser.role,
        isImpersonating: true,
        testingRole: null,
      };
    }
  }

  return {
    session,
    realUser,
    effectiveUser: realUser,
    effectiveRole: realUser.role,
    isImpersonating: false,
    testingRole: null,
  };
}

function buildPermissionsPayload(role: Role, matrix: RolePermissionsMap): Record<PermissionKey, boolean> {
  if (role === 'creator') {
    return {
      view_store: true,
      buy_products: true,
      create_products: true,
      edit_products: true,
      delete_products: true,
      ai_research: true,
      social_autopost: true,
      manage_gateways: true,
      view_orders: true,
      view_analytics: true,
    };
  }
  return { ...matrix[role] };
}

function buildSessionResponse(auth: AuthContext, db: DatabaseSchema) {
  return {
    realUser: auth.realUser ? sanitizeUser(auth.realUser) : null,
    effectiveUser: auth.effectiveUser ? sanitizeUser(auth.effectiveUser) : null,
    effectiveRole: auth.effectiveRole,
    isImpersonating: auth.isImpersonating,
    testingRole: auth.testingRole,
    permissions: buildPermissionsPayload(auth.effectiveRole, db.roleMatrix),
    roleMatrix: db.roleMatrix,
  };
}

function setSessionCookie(res: Response, req: Request, token: string) {
  const isHttps = req.secure || req.header('x-forwarded-proto') === 'https';
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'produto'
  );
}

function verifyStripeWebhookSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = Number(parts.find((part) => part.startsWith('t='))?.slice(2));
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))
    .filter((signature) => /^[a-f0-9]{64}$/i.test(signature));

  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || signatures.length === 0) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`, 'utf8')
    .digest();
  return signatures.some((signature) => {
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

function updateStripeOrder(orderId: string, outcome: 'paid' | 'cancelled'): boolean {
  const db = getDb();
  const order = db.orders.find((candidate) => candidate.id === orderId);
  if (!order || order.gatewayId !== 'gw_stripe') return false;

  if (outcome === 'paid') {
    if (order.paymentStatus === 'paid') return true;
    if (order.paymentStatus !== 'processing') return false;
    order.paymentStatus = 'paid';
    for (const item of order.items) {
      const product = db.products.find((candidate) => candidate.id === item.productId);
      if (product) product.salesCount += item.quantity;
    }
    const sourceRef = order.sourceRef || '';
    if (sourceRef && sourceRef !== 'direct') {
      for (const post of db.socialPosts) {
        if (post.buyLink.includes(sourceRef)) post.conversions += 1;
      }
    }
  } else {
    if (order.paymentStatus !== 'processing') return false;
    order.paymentStatus = 'cancelled';
    for (const item of order.items) {
      const product = db.products.find((candidate) => candidate.id === item.productId);
      if (product) product.stock += item.quantity;
    }
  }

  saveDb(db);
  return true;
}

export async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    if (req.secure || req.header('x-forwarded-proto') === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https: wss:; form-action 'self'"
      );
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.path !== '/api/webhooks/stripe') {
      const source = req.get('origin') || req.get('referer');
      if (source) {
        try {
          if (new URL(source).host !== req.get('host')) {
            return res.status(403).json({ error: 'Origem da solicitação inválida.' });
          }
        } catch {
          return res.status(403).json({ error: 'Origem da solicitação inválida.' });
        }
      }
    }
    next();
  });
  usePersistentState(app);
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
    if (!webhookSecret.startsWith('whsec_')) {
      return res.status(503).json({ error: 'Webhook Stripe ainda não foi configurado.' });
    }
    const signature = req.header('stripe-signature') || '';
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyStripeWebhookSignature(rawBody, signature, webhookSecret)) {
      return res.status(400).json({ error: 'Assinatura Stripe inválida.' });
    }

    try {
      const event = JSON.parse(rawBody.toString('utf8')) as {
        type?: string;
        data?: { object?: { payment_status?: string; client_reference_id?: string; metadata?: { order_id?: string } } };
      };
      const session = event.data?.object;
      const orderId = session?.metadata?.order_id || session?.client_reference_id || '';
      if (orderId && (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')) {
        if (session?.payment_status === 'paid') updateStripeOrder(orderId, 'paid');
      } else if (orderId && (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed')) {
        updateStripeOrder(orderId, 'cancelled');
      }
      return res.json({ received: true });
    } catch {
      return res.status(400).json({ error: 'Evento Stripe inválido.' });
    }
  });
  app.use(express.json({ limit: '15mb' }));

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // AUTHENTICATION, ROLE-TESTING & CREATOR IMPERSONATION
  // ---------------------------------------------------------------------------
  app.get('/api/auth/me', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    res.json(buildSessionResponse(auth, db));
  });

  app.post('/api/auth/login', (req, res) => {
    if (rateLimit(req, res, 'login', 8, 15 * 60 * 1000)) return;
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Informe usuário e senha.' });
    }
    if (String(username).length > 64 || String(password).length > 128) {
      return res.status(400).json({ error: 'Usuário ou senha inválidos.' });
    }
    const db = getDb();
    const normalized = String(username).trim().toLowerCase();
    const user = db.users.find((u) => u.username.toLowerCase() === normalized);
    const passwordMatches = verifyPassword(String(password), user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }
    if (user.banned) {
      return res.status(403).json({
        error: 'Esta conta foi banida pelo criador da plataforma.',
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.lastLoginAt = new Date().toISOString();
    db.sessions.push({
      token: hashSessionToken(token),
      realUserId: user.id,
      impersonatedUserId: null,
      testingRole: null,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);
    setSessionCookie(res, req, token);
    const auth = resolveAuth(req, db, token);
    return res.json(buildSessionResponse(auth, db));
  });

  app.post('/api/auth/register', (req, res) => {
    if (rateLimit(req, res, 'register', 5, 60 * 60 * 1000)) return;
    const { username, displayName, password, city, phone } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Preencha usuário e senha.' });
    }
    const cleanUsername = String(username).trim();
    if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(cleanUsername) || String(password).length < 12 || String(password).length > 128) {
      return res.status(400).json({
        error: 'Use um usuário de 3 a 32 caracteres e uma senha de 12 a 128 caracteres.',
      });
    }

    const db = getDb();
    const exists = db.users.some((u) => u.username.toLowerCase() === cleanUsername.toLowerCase());
    if (exists) {
      return res.status(409).json({ error: 'Este usuário já está cadastrado.' });
    }

    const now = new Date().toISOString();
    const newUser: StoredUser = {
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      username: cleanUsername,
      displayName: String(displayName || cleanUsername).trim().slice(0, 80),
      passwordHash: hashPassword(String(password)),
      role: 'user',
      banned: false,
      createdAt: now,
      lastLoginAt: now,
      bio: 'Novo cliente cadastrado na TinaVitrine.',
      city: String(city || 'Brasil').trim().slice(0, 80),
      phone: String(phone || '').trim().slice(0, 32),
    };
    db.users.push(newUser);

    const token = crypto.randomBytes(32).toString('hex');
    db.sessions.push({
      token: hashSessionToken(token),
      realUserId: newUser.id,
      impersonatedUserId: null,
      testingRole: null,
      createdAt: now,
    });
    saveDb(db);
    setSessionCookie(res, req, token);
    return res.status(201).json({
      realUser: sanitizeUser(newUser),
      effectiveUser: sanitizeUser(newUser),
      effectiveRole: 'user',
      isImpersonating: false,
      testingRole: null,
      permissions: buildPermissionsPayload('user', db.roleMatrix),
      roleMatrix: db.roleMatrix,
    });
  });

  app.put('/api/auth/credentials', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!auth.session || !auth.realUser) {
      return res.status(401).json({ error: 'Entre na sua conta para alterar os dados de acesso.' });
    }
    if (auth.isImpersonating || auth.effectiveUser?.id !== auth.realUser.id) {
      return res.status(403).json({ error: 'Saia da conta de outra pessoa para alterar seus dados de acesso.' });
    }

    const { currentPassword, newUsername, newPassword } = req.body ?? {};
    if (!currentPassword || !verifyPassword(String(currentPassword), auth.realUser.passwordHash)) {
      return res.status(401).json({ error: 'A senha atual está incorreta.' });
    }

    const cleanUsername = String(newUsername ?? '').trim();
    const cleanPassword = String(newPassword ?? '');
    const usernameChanged = cleanUsername !== '' && cleanUsername !== auth.realUser.username;
    const passwordChanged = cleanPassword !== '';

    if (cleanUsername && !/^[\p{L}\p{N}._-]{3,32}$/u.test(cleanUsername)) {
      return res.status(400).json({ error: 'Use um usuário de 3 a 32 caracteres.' });
    }
    if (passwordChanged && (cleanPassword.length < 12 || cleanPassword.length > 128)) {
      return res.status(400).json({ error: 'A nova senha precisa ter de 12 a 128 caracteres.' });
    }
    if (!usernameChanged && !passwordChanged) {
      return res.status(400).json({ error: 'Informe um novo usuário ou uma nova senha.' });
    }

    if (usernameChanged) {
      const usernameInUse = db.users.some(
        (user) =>
          user.id !== auth.realUser?.id &&
          user.username.toLowerCase() === cleanUsername.toLowerCase()
      );
      if (usernameInUse) {
        return res.status(409).json({ error: 'Este usuário já está em uso.' });
      }
      auth.realUser.username = cleanUsername;
    }
    if (passwordChanged) {
      auth.realUser.passwordHash = hashPassword(cleanPassword);
    }

    saveDb(db);
    return res.json({ user: sanitizeUser(auth.realUser) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const db = getDb();
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (token) {
      const tokenHash = hashSessionToken(token);
      db.sessions = db.sessions.filter((s) => s.token !== tokenHash);
      saveDb(db);
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.post('/api/auth/impersonate', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!auth.session || auth.realUser?.role !== 'creator') {
      return res.status(403).json({ error: 'Apenas o criador pode acessar outras contas.' });
    }
    const { userId } = req.body ?? {};
    const target = db.users.find((u) => u.id === userId);
    if (!target) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    auth.session.impersonatedUserId = target.id === auth.realUser.id ? null : target.id;
    auth.session.testingRole = null;
    saveDb(db);
    const updatedAuth = resolveAuth(req, db);
    return res.json(buildSessionResponse(updatedAuth, db));
  });

  app.post('/api/auth/stop-impersonate', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!auth.session || auth.realUser?.role !== 'creator') {
      return res.status(403).json({ error: 'Ação restrita ao criador.' });
    }
    auth.session.impersonatedUserId = null;
    auth.session.testingRole = null;
    saveDb(db);
    const updatedAuth = resolveAuth(req, db);
    return res.json(buildSessionResponse(updatedAuth, db));
  });

  app.post('/api/auth/test-role', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!auth.session || auth.realUser?.role !== 'creator') {
      return res.status(403).json({ error: 'Apenas o criador pode alternar cargos de teste.' });
    }
    const { role } = req.body ?? {};
    if (!['creator', 'admin', 'user', 'guest'].includes(role)) {
      return res.status(400).json({ error: 'Cargo inválido para teste.' });
    }
    auth.session.impersonatedUserId = null;
    auth.session.testingRole = role === 'creator' ? null : (role as Role);
    saveDb(db);
    const updatedAuth = resolveAuth(req, db);
    return res.json(buildSessionResponse(updatedAuth, db));
  });

  // ---------------------------------------------------------------------------
  // USERS & PRIVACY (STRICTLY CREATOR-ONLY FOR VIEWING OTHER PROFILES)
  // ---------------------------------------------------------------------------
  app.get('/api/users', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (auth.realUser?.role !== 'creator' || auth.effectiveRole !== 'creator') {
      return res.status(403).json({
        error: 'Apenas o criador pode visualizar a lista de usuários cadastrados.',
      });
    }
    const usersWithStats = db.users.map((u) => {
      const userOrders = db.orders.filter((o) => o.userId === u.id);
      return {
        ...sanitizeUser(u),
        ordersCount: userOrders.length,
        totalSpent: userOrders.reduce((sum, o) => sum + o.total, 0),
      };
    });
    return res.json({ users: usersWithStats });
  });

  app.get('/api/users/:id/profile', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    const targetId = req.params.id;
    const isCreatorViewing = auth.realUser?.role === 'creator' && auth.effectiveRole === 'creator';
    const isSelf = auth.effectiveUser?.id === targetId;

    if (!isCreatorViewing && !isSelf) {
      return res.status(403).json({
        error: 'Acesso negado: outros usuários não podem visualizar perfis de terceiros.',
      });
    }

    const user = db.users.find((u) => u.id === targetId);
    if (!user) {
      return res.status(404).json({ error: 'Perfil não encontrado.' });
    }

    const userOrders = db.orders.filter((o) => o.userId === user.id);
    return res.json({
      profile: sanitizeUser(user),
      orders: userOrders,
      canManage: isCreatorViewing && user.role !== 'creator',
    });
  });

  app.patch('/api/users/:id/ban', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (auth.realUser?.role !== 'creator' || auth.effectiveRole !== 'creator') {
      return res.status(403).json({ error: 'Apenas o criador pode banir ou desbanir usuários.' });
    }
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    if (user.role === 'creator') {
      return res.status(400).json({ error: 'Não é possível banir a conta do criador.' });
    }
    user.banned = typeof req.body?.banned === 'boolean' ? req.body.banned : !user.banned;
    if (user.banned) {
      db.sessions = db.sessions.filter((s) => s.realUserId !== user.id);
    }
    saveDb(db);
    return res.json({ user: sanitizeUser(user) });
  });

  app.delete('/api/users/:id', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (auth.realUser?.role !== 'creator' || auth.effectiveRole !== 'creator') {
      return res.status(403).json({ error: 'Apenas o criador pode excluir usuários.' });
    }
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    if (user.role === 'creator') {
      return res.status(400).json({ error: 'Não é possível excluir a conta do criador.' });
    }
    db.users = db.users.filter((u) => u.id !== user.id);
    db.sessions = db.sessions.filter(
      (s) => s.realUserId !== user.id && s.impersonatedUserId !== user.id
    );
    saveDb(db);
    return res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // ROLE PERMISSIONS MATRIX
  // ---------------------------------------------------------------------------
  app.get('/api/permissions', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    return res.json({
      roleMatrix: db.roleMatrix,
      effectiveRole: auth.effectiveRole,
    });
  });

  app.put('/api/permissions', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (auth.realUser?.role !== 'creator' || auth.effectiveRole !== 'creator') {
      return res.status(403).json({ error: 'Apenas o criador pode alterar permissões de cargos.' });
    }
    const incoming = req.body?.roleMatrix as Partial<RolePermissionsMap> | undefined;
    if (!incoming) {
      return res.status(400).json({ error: 'Matriz de permissões ausente.' });
    }
    for (const role of ['admin', 'user', 'guest'] as Role[]) {
      if (incoming[role]) {
        for (const key of Object.keys(db.roleMatrix[role]) as PermissionKey[]) {
          if (typeof incoming[role]?.[key] === 'boolean') {
            db.roleMatrix[role][key] = Boolean(incoming[role]?.[key]);
          }
        }
      }
    }
    saveDb(db);
    return res.json({ roleMatrix: db.roleMatrix });
  });

  // ---------------------------------------------------------------------------
  // PRODUCTS & STOREFRONT
  // ---------------------------------------------------------------------------
  app.get('/api/products', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'view_store', db)) {
      return res.status(403).json({ error: 'Visualização da vitrine desabilitada para este cargo.' });
    }
    res.json({ products: db.products });
  });

  app.post('/api/products', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'create_products', db)) {
      return res.status(403).json({ error: 'Sem permissão para cadastrar produtos.' });
    }

    const body = req.body ?? {};
    const name = String(body.name || '').trim();
    const price = Number(body.price);
    if (!name || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: 'Informe nome e preço válido para o produto.' });
    }

    const id = `prod_${crypto.randomBytes(5).toString('hex')}`;
    const product = {
      id,
      slug: slugify(name),
      name,
      description: String(body.description || '').trim() || 'Produto disponível para compra imediata.',
      category: String(body.category || 'Geral').trim(),
      tags: Array.isArray(body.tags)
        ? body.tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean)
        : [],
      price: Number(price.toFixed(2)),
      minMarketPrice: Math.max(0, Number(body.minMarketPrice) || 0),
      maxMarketPrice: Math.max(0, Number(body.maxMarketPrice) || 0),
      avgMarketPrice: Math.max(0, Number(body.avgMarketPrice) || 0),
      imageUrl: String(body.imageUrl || '/src/assets/images/product_fone_anc_1794903448625.jpg'),
      stock: Math.max(0, Number(body.stock) || 10),
      featured: Boolean(body.featured),
      sources: Array.isArray(body.sources) ? body.sources : [],
      clicksFromSocial: 0,
      salesCount: 0,
      createdBy: auth.effectiveUser?.id || 'system',
      createdAt: new Date().toISOString(),
    };

    db.products.unshift(product);
    saveDb(db);
    return res.status(201).json({ product });
  });

  app.put('/api/products/:id', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'edit_products', db)) {
      return res.status(403).json({ error: 'Sem permissão para editar produtos.' });
    }
    const product = db.products.find((p) => p.id === req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }
    const body = req.body ?? {};
    if (body.name) {
      product.name = String(body.name).trim();
      product.slug = slugify(product.name);
    }
    if (typeof body.description === 'string') product.description = body.description.trim();
    if (typeof body.category === 'string') product.category = body.category.trim();
    if (Array.isArray(body.tags)) {
      product.tags = body.tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean);
    }
    if (Number.isFinite(Number(body.price)) && Number(body.price) > 0) {
      product.price = Number(Number(body.price).toFixed(2));
    }
    if (Number.isFinite(Number(body.stock))) {
      product.stock = Math.max(0, Number(body.stock));
    }
    if (Number.isFinite(Number(body.minMarketPrice)) && Number(body.minMarketPrice) >= 0) {
      product.minMarketPrice = Number(Number(body.minMarketPrice).toFixed(2));
    }
    if (Number.isFinite(Number(body.maxMarketPrice)) && Number(body.maxMarketPrice) >= 0) {
      product.maxMarketPrice = Number(Number(body.maxMarketPrice).toFixed(2));
    }
    if (Number.isFinite(Number(body.avgMarketPrice)) && Number(body.avgMarketPrice) >= 0) {
      product.avgMarketPrice = Number(Number(body.avgMarketPrice).toFixed(2));
    }
    if (typeof body.imageUrl === 'string' && body.imageUrl.trim()) {
      product.imageUrl = body.imageUrl.trim();
    }
    if (Array.isArray(body.sources)) {
      product.sources = body.sources.filter(
        (source: unknown) =>
          source &&
          typeof source === 'object' &&
          typeof (source as { title?: unknown }).title === 'string' &&
          typeof (source as { uri?: unknown }).uri === 'string'
      );
    }
    saveDb(db);
    return res.json({ product });
  });

  app.delete('/api/products/:id', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'delete_products', db)) {
      return res.status(403).json({ error: 'Sem permissão para excluir produtos.' });
    }
    const before = db.products.length;
    db.products = db.products.filter((p) => p.id !== req.params.id);
    if (db.products.length === before) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }
    saveDb(db);
    return res.json({ ok: true });
  });

  app.post('/api/products/:id/track-click', (req, res) => {
    const db = getDb();
    const product = db.products.find((p) => p.id === req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }
    product.clicksFromSocial += 1;
    const ref = String(req.body?.ref || '').trim();
    if (ref) {
      for (const post of db.socialPosts) {
        if (post.productId === product.id && post.buyLink.includes(ref)) {
          post.clicks += 1;
        }
      }
    }
    saveDb(db);
    return res.json({ clicksFromSocial: product.clicksFromSocial });
  });

  // ---------------------------------------------------------------------------
  // PRODUCT RESEARCH (TAVILY WEB SEARCH) & DISABLED AI IMAGE
  // ---------------------------------------------------------------------------
  app.get('/api/ai/image-status', (_req, res) => {
    res.json({
      enabled: false,
      reason: 'Geração de fotos com IA desativada no momento (requer chave de API paga).',
    });
  });

  app.post('/api/ai/generate-image', (_req, res) => {
    res.status(403).json({
      disabled: true,
      error: 'A geração de imagens com IA está desativada no momento (requer chave de API paga).',
    });
  });

  app.post('/api/ai/research-product', async (req, res) => {
    if (rateLimit(req, res, 'research', 12, 60 * 1000)) return;
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'ai_research', db)) {
      return res.status(403).json({ error: 'Sem permissão para usar pesquisa com IA.' });
    }
    const { query, productUrl, imageUrl, imageDataUrl } = req.body ?? {};
    if (!query && !productUrl && !imageUrl && !imageDataUrl) {
      return res.status(400).json({
        error: 'Informe o nome/modelo do produto ou envie uma imagem para pesquisar.',
      });
    }
    try {
      const result = imageUrl || imageDataUrl
        ? await researchProductFromImage({ query, imageUrl, imageDataUrl })
        : await researchProductWithTavily({ query, productUrl });
      return res.json({ result });
    } catch (err) {
      const mapped = mapProductResearchError(err);
      return res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // ---------------------------------------------------------------------------
  // FACEBOOK & SOCIAL MEDIA AUTO-POSTING
  // ---------------------------------------------------------------------------
  app.get('/api/social/facebook/auth-url', (req, res) => {
    const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const callbackUrl = `${appUrl}/auth/facebook/callback`;
    const clientId = process.env.FACEBOOK_APP_ID;
    if (!clientId) {
      return res.json({
        configured: false,
        callbackUrl,
        url: null,
      });
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'public_profile,pages_manage_posts,publish_to_groups',
    });
    return res.json({
      configured: true,
      callbackUrl,
      url: `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`,
    });
  });

  app.get(['/auth/facebook/callback', '/auth/facebook/callback/'], (_req, res) => {
    res.send(`<!doctype html>
      <html>
        <body style="font-family: sans-serif; padding: 24px;">
          <script src="/auth/facebook/callback.js" defer></script>
          <p>Conexão com Facebook concluída. Esta janela fechará automaticamente.</p>
        </body>
      </html>`);
  });

  app.get(['/auth/facebook/callback.js', '/api/auth/facebook/callback.js'], (_req, res) => {
    res.type('application/javascript').send(
      "if (window.opener) { window.opener.postMessage({ type: 'OAUTH_FB_SUCCESS' }, window.location.origin); window.close(); } else { window.location.replace('/'); }"
    );
  });

  app.get('/api/auth/facebook/callback', (_req, res) => {
    res.send(`<!doctype html>
      <html><head><meta charset="utf-8"><title>Facebook conectado</title></head>
        <body style="font-family: sans-serif; padding: 24px;">
          <script src="/auth/facebook/callback.js" defer></script>
          <p>Conexão com Facebook concluída. Esta janela fechará automaticamente.</p>
        </body>
      </html>`);
  });

  app.get('/api/social/state', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'social_autopost', db)) {
      return res.status(403).json({ error: 'Sem permissão para gerenciar redes sociais.' });
    }
    return res.json({
      accounts: db.socialAccounts,
      posts: db.socialPosts,
    });
  });

  app.post('/api/social/connect-facebook', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'social_autopost', db)) {
      return res.status(403).json({ error: 'Sem permissão para configurar Facebook.' });
    }
    const {
      accountName,
      defaultTargetType,
      selectedGroupIds,
      autoPostEnabled,
      customGroupName,
    } = req.body ?? {};

    const validType: FacebookTargetType = ['profile', 'single_group', 'multiple_groups'].includes(
      defaultTargetType
    )
      ? defaultTargetType
      : 'profile';

    let account = db.socialAccounts.find((a) => a.platform === 'facebook');
    if (!account) {
      account = {
        id: 'fb_acc_main',
        platform: 'facebook',
        accountName: String(accountName || 'Minha Conta Facebook').trim(),
        profileUrl: 'https://facebook.com',
        connectedAt: new Date().toISOString(),
        isLiveOAuth: Boolean(process.env.FACEBOOK_APP_ID),
        defaultTargetType: validType,
        selectedGroupIds: [],
        availableGroups: [],
        autoPostEnabled: true,
      };
      db.socialAccounts.push(account);
    }

    if (accountName) account.accountName = String(accountName).trim();
    account.defaultTargetType = validType;
    account.autoPostEnabled = typeof autoPostEnabled === 'boolean' ? autoPostEnabled : true;
    account.connectedAt = new Date().toISOString();

    if (customGroupName && String(customGroupName).trim()) {
      const newGrpId = `grp_${crypto.randomBytes(4).toString('hex')}`;
      account.availableGroups.push({
        id: newGrpId,
        name: String(customGroupName).trim(),
        membersCount: 1200,
      });
      account.selectedGroupIds = Array.from(
        new Set([...(Array.isArray(selectedGroupIds) ? selectedGroupIds : account.selectedGroupIds), newGrpId])
      );
    } else if (Array.isArray(selectedGroupIds)) {
      account.selectedGroupIds = selectedGroupIds.map((g: unknown) => String(g));
    }

    saveDb(db);
    return res.json({ account });
  });

  app.post('/api/social/posts', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'social_autopost', db)) {
      return res.status(403).json({ error: 'Sem permissão para criar postagens automáticas.' });
    }
    const {
      productId,
      targetType,
      selectedGroupIds,
      caption,
      publishNow,
      scheduledFor,
      baseOrigin,
    } = req.body ?? {};

    const product = db.products.find((p) => p.id === productId);
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado para postagem.' });
    }
    const account = db.socialAccounts.find((a) => a.platform === 'facebook');
    const chosenType: FacebookTargetType = ['profile', 'single_group', 'multiple_groups'].includes(
      targetType
    )
      ? targetType
      : account?.defaultTargetType || 'profile';

    const groupIds: string[] = Array.isArray(selectedGroupIds)
      ? selectedGroupIds.map(String)
      : account?.selectedGroupIds || [];

    let targetNames: string[] = [];
    if (chosenType === 'profile') {
      targetNames = [account?.accountName || 'Perfil do Facebook'];
    } else {
      const matched = (account?.availableGroups || []).filter((g) => groupIds.includes(g.id));
      targetNames =
        matched.length > 0
          ? chosenType === 'single_group'
            ? [matched[0].name]
            : matched.map((m) => m.name)
          : ['Grupo do Facebook Selecionado'];
    }

    const refCode =
      chosenType === 'profile'
        ? 'fb_perfil'
        : `fb_${(groupIds[0] || 'grupo').slice(0, 20)}`;
    const origin = String(baseOrigin || '').replace(/\/+$/, '');
    const buyLink = origin
      ? `${origin}/?produto=${product.id}&ref=${refCode}`
      : `/?produto=${product.id}&ref=${refCode}`;

    const now = new Date().toISOString();
    const isNow = publishNow !== false;

    const post = {
      id: `post_${crypto.randomBytes(5).toString('hex')}`,
      productId: product.id,
      productName: product.name,
      productImage: product.imageUrl,
      buyLink,
      platform: 'facebook' as const,
      targetType: chosenType,
      targetNames,
      caption:
        String(caption || '').trim() ||
        `${product.name} por R$ ${product.price.toFixed(2)}${product.avgMarketPrice > 0 ? ` (média pesquisada na web: R$ ${product.avgMarketPrice.toFixed(2)})` : ''}. Compre direto no nosso site!`,
      status: isNow ? ('published' as const) : ('scheduled' as const),
      scheduledFor: isNow ? null : scheduledFor || new Date(Date.now() + 3600_000).toISOString(),
      publishedAt: isNow ? now : null,
      clicks: 0,
      conversions: 0,
      createdAt: now,
    };

    db.socialPosts.unshift(post);
    saveDb(db);
    return res.status(201).json({ post });
  });

  app.post('/api/social/posts/:id/publish', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'social_autopost', db)) {
      return res.status(403).json({ error: 'Sem permissão para publicar postagens.' });
    }
    const post = db.socialPosts.find((p) => p.id === req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Postagem não encontrada.' });
    }
    post.status = 'published';
    post.publishedAt = new Date().toISOString();
    post.scheduledFor = null;
    saveDb(db);
    return res.json({ post });
  });

  app.delete('/api/social/posts/:id', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'social_autopost', db)) {
      return res.status(403).json({ error: 'Sem permissão para remover postagens.' });
    }
    db.socialPosts = db.socialPosts.filter((p) => p.id !== req.params.id);
    saveDb(db);
    return res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // PAYMENT GATEWAYS & AUTOMATIC ORDER PROCESSING
  // ---------------------------------------------------------------------------
  app.get('/api/gateways', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    const canManage = roleHasPermission(auth.effectiveRole, 'manage_gateways', db);
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
    const stripeKeyInfo = getStripeKeyInfo(stripeSecretKey);
    const pixConfigured = hasPixCopyPaste(getPixCopyPaste());
    const gatewayList = db.gateways.map((gateway) => {
      if (gateway.provider === 'pix') {
        return { ...gateway, enabled: gateway.enabled && pixConfigured, configured: pixConfigured };
      }
      if (gateway.provider === 'mercadopago' || gateway.provider === 'pagbank') {
        return { ...gateway, enabled: false, configured: false };
      }
      if (gateway.provider !== 'stripe') return { ...gateway, configured: true };
      return {
        ...gateway,
        enabled: gateway.enabled && Boolean(stripeKeyInfo),
        configured: Boolean(stripeKeyInfo),
        webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()?.startsWith('whsec_')),
        merchantKeyMasked: stripeKeyInfo
          ? `${stripeKeyInfo.prefix}_••••${stripeSecretKey.slice(-4)}`
          : '',
      };
    });
    if (canManage) {
      return res.json({ gateways: gatewayList });
    }
    return res.json({
      gateways: gatewayList
        .filter((g) => g.enabled)
        .map(({ id, provider, name, settlementTime }) => ({
          id,
          provider,
          name,
          enabled: true,
          mode: 'production',
          feePercent: 0,
          settlementTime,
          merchantKeyMasked: '',
          webhookUrl: '',
        })),
    });
  });

  app.put('/api/gateways/:id', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'manage_gateways', db)) {
      return res.status(403).json({ error: 'Sem permissão para configurar gateways de pagamento.' });
    }
    const gw = db.gateways.find((g) => g.id === req.params.id);
    if (!gw) {
      return res.status(404).json({ error: 'Gateway não encontrado.' });
    }
    const body = req.body ?? {};
    if (body.enabled === true) {
      if (gw.provider === 'pix' && !hasPixCopyPaste(getPixCopyPaste())) {
        return res.status(400).json({ error: 'Informe um código Pix Copia e Cola válido antes de ativar o Pix.' });
      }
      if (gw.provider === 'stripe' && !process.env.STRIPE_SECRET_KEY?.trim()) {
        return res.status(400).json({ error: 'Configure STRIPE_SECRET_KEY no servidor antes de ativar o Stripe.' });
      }
      if (gw.provider === 'mercadopago' || gw.provider === 'pagbank') {
        return res.status(400).json({ error: `${gw.name} está desativado porque não há integração e credenciais configuradas.` });
      }
    }
    if (typeof body.enabled === 'boolean') gw.enabled = body.enabled;
    if (body.mode === 'sandbox' || body.mode === 'production') gw.mode = body.mode;
    if (Number.isFinite(Number(body.feePercent)) && Number(body.feePercent) >= 0) {
      gw.feePercent = Number(Number(body.feePercent).toFixed(2));
    }
    if (typeof body.merchantKeyMasked === 'string' && body.merchantKeyMasked.trim()) {
      gw.merchantKeyMasked = body.merchantKeyMasked.trim();
    }
    saveDb(db);
    return res.json({ gateway: gw });
  });

  app.get('/api/orders', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (roleHasPermission(auth.effectiveRole, 'view_orders', db)) {
      return res.json({ orders: db.orders });
    }
    if (!auth.effectiveUser) {
      return res.json({ orders: [] });
    }
    return res.json({
      orders: db.orders.filter((o) => o.userId === auth.effectiveUser?.id),
    });
  });

  app.post('/api/orders/:id/confirm-pix', (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'manage_gateways', db)) {
      return res.status(403).json({ error: 'Sem permissão para confirmar pagamentos Pix.' });
    }
    const order = db.orders.find((candidate) => candidate.id === req.params.id);
    if (!order || order.gatewayId !== 'gw_pix' || order.paymentStatus !== 'pending_pix') {
      return res.status(404).json({ error: 'Pedido Pix pendente não encontrado.' });
    }
    for (const item of order.items) {
      const product = db.products.find((candidate) => candidate.id === item.productId);
      if (!product || product.stock < item.quantity) {
        return res.status(409).json({ error: `Estoque insuficiente para confirmar ${item.productName}.` });
      }
    }
    for (const item of order.items) {
      const product = db.products.find((candidate) => candidate.id === item.productId);
      if (product) {
        product.stock -= item.quantity;
        product.salesCount += item.quantity;
      }
    }
    order.paymentStatus = 'paid';
    if (order.sourceRef && order.sourceRef !== 'direct') {
      for (const post of db.socialPosts) {
        if (post.buyLink.includes(order.sourceRef)) post.conversions += 1;
      }
    }
    saveDb(db);
    return res.json({ order });
  });

  app.post('/api/orders', async (req, res) => {
    const db = getDb();
    const auth = resolveAuth(req, db);
    if (!roleHasPermission(auth.effectiveRole, 'buy_products', db)) {
      return res.status(403).json({
        error: 'Compras estão desabilitadas para este cargo no momento.',
      });
    }
    const {
      items,
      gatewayId,
      customerName,
      customerPhone,
      shippingAddress,
      sourceRef,
    } = req.body ?? {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Seu carrinho está vazio.' });
    }
    if (!customerName || !shippingAddress) {
      return res.status(400).json({ error: 'Preencha nome e endereço de entrega.' });
    }

    const gateway = db.gateways.find((g) => g.id === gatewayId && g.enabled);
    if (!gateway) {
      return res.status(400).json({ error: 'Selecione um gateway de pagamento ativo.' });
    }
    if (gateway.provider === 'pix' && !hasPixCopyPaste(getPixCopyPaste())) {
      return res.status(503).json({ error: 'O Pix está desativado porque falta um código Copia e Cola.' });
    }
    if (gateway.provider === 'mercadopago' || gateway.provider === 'pagbank') {
      return res.status(503).json({ error: `${gateway.name} não está integrado e permanece desativado.` });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
    if (gateway.provider === 'stripe') {
      if (!stripeSecretKey) {
        return res.status(503).json({ error: 'Stripe ainda não está conectado no servidor.' });
      }
      const stripeKeyInfo = getStripeKeyInfo(stripeSecretKey);
      if (!stripeKeyInfo) {
        return res.status(503).json({ error: 'Configure uma chave secreta sk_ ou restrita rk_ do Stripe.' });
      }
      if (gateway.mode !== stripeKeyInfo.mode) {
        return res.status(400).json({
          error: `O modo do gateway Stripe está em ${gateway.mode === 'sandbox' ? 'teste' : 'produção'}, mas a chave configurada é ${stripeKeyInfo.mode === 'sandbox' ? 'de teste' : 'de produção'}.`,
        });
      }
    }

    const orderItems: OrderItemRecord[] = [];
    const selectedProducts: Array<{ product: ProductRecord; quantity: number }> = [];
    let subtotal = 0;

    for (const rawItem of items) {
      const product = db.products.find((p) => p.id === rawItem.productId);
      const qty = Math.max(1, Math.floor(Number(rawItem.quantity) || 1));
      if (!product) {
        return res.status(404).json({ error: 'Um dos produtos do carrinho não existe mais.' });
      }
      if (product.stock < qty) {
        return res.status(400).json({
          error: `Estoque insuficiente para "${product.name}". Disponível: ${product.stock}.`,
        });
      }
      subtotal += product.price * qty;
      selectedProducts.push({ product, quantity: qty });
      orderItems.push({
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        quantity: qty,
        imageUrl: product.imageUrl,
      });
    }

    const gatewayFee = Number(((subtotal * gateway.feePercent) / 100).toFixed(2));
    const orderId = `PED-${1043 + db.orders.length}`;
    let stripeSession: { id: string; url: string } | undefined;
    if (gateway.provider === 'stripe') {
      const configuredAppUrl = process.env.APP_URL?.trim() || '';
      const appUrl = (configuredAppUrl && !configuredAppUrl.includes('MY_APP_URL')
        ? configuredAppUrl
        : `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      const stripeParams = new URLSearchParams();
      stripeParams.set('mode', 'payment');
      stripeParams.set('success_url', `${appUrl}/api/stripe/complete?session_id={CHECKOUT_SESSION_ID}`);
      stripeParams.set('cancel_url', `${appUrl}/?pagamento=cancelado`);
      stripeParams.set('client_reference_id', orderId);
      stripeParams.set('metadata[order_id]', orderId);
      orderItems.forEach((item, index) => {
        stripeParams.set(`line_items[${index}][price_data][currency]`, 'brl');
        stripeParams.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(item.unitPrice * 100)));
        stripeParams.set(`line_items[${index}][price_data][product_data][name]`, item.productName);
        stripeParams.set(`line_items[${index}][quantity]`, String(item.quantity));
      });

      try {
        const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${stripeSecretKey}:`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: stripeParams,
        });
        const stripeData = await stripeResponse.json() as {
          id?: string;
          url?: string;
          error?: { message?: string };
        };
        if (!stripeResponse.ok || !stripeData.id || !stripeData.url) {
          return res.status(502).json({
            error: stripeData.error?.message || 'Não foi possível abrir o checkout do Stripe.',
          });
        }
        stripeSession = { id: stripeData.id, url: stripeData.url };
      } catch {
        return res.status(502).json({ error: 'Não foi possível conectar ao Stripe. Tente novamente.' });
      }
    }

    const paymentStatus: OrderRecord['paymentStatus'] = gateway.provider === 'pix'
      ? 'pending_pix'
      : gateway.provider === 'stripe'
        ? 'processing'
        : 'paid';
    if (paymentStatus !== 'pending_pix') {
      for (const { product, quantity } of selectedProducts) {
        product.stock -= quantity;
        if (paymentStatus === 'paid') product.salesCount += quantity;
      }
    }
    if (paymentStatus === 'paid' && sourceRef) {
      const cleanRef = String(sourceRef);
      for (const post of db.socialPosts) {
        if (post.buyLink.includes(cleanRef)) post.conversions += 1;
      }
    }

    const pixCopyPaste = gateway.provider === 'pix' ? getPixCopyPaste() : undefined;

    const order = {
      id: orderId,
      userId: auth.effectiveUser?.id || null,
      customerName: String(customerName).trim(),
      customerPhone: String(customerPhone || '').trim(),
      shippingAddress: String(shippingAddress).trim(),
      items: orderItems,
      subtotal: Number(subtotal.toFixed(2)),
      gatewayFee,
      total: Number(subtotal.toFixed(2)),
      gatewayId: gateway.id,
      gatewayName: gateway.name,
      paymentStatus,
      pixCopyPaste,
      paymentReference: stripeSession?.id,
      sourceRef: sourceRef ? String(sourceRef) : 'direct',
      createdAt: new Date().toISOString(),
    };

    db.orders.unshift(order);
    saveDb(db);
    return res.status(201).json({ order, checkoutUrl: stripeSession?.url });
  });

  app.get('/api/stripe/complete', async (req, res) => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
    const configuredAppUrl = process.env.APP_URL?.trim() || '';
    const appUrl = (configuredAppUrl && !configuredAppUrl.includes('MY_APP_URL')
      ? configuredAppUrl
      : `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
    if (!stripeSecretKey || !sessionId) {
      return res.redirect(`${appUrl}/?pagamento=erro`);
    }

    try {
      const stripeResponse = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
        { headers: { Authorization: `Basic ${Buffer.from(`${stripeSecretKey}:`).toString('base64')}` } }
      );
      const session = await stripeResponse.json() as {
        id?: string;
        currency?: string;
        amount_total?: number;
        payment_status?: string;
        client_reference_id?: string;
        metadata?: { order_id?: string };
      };
      const orderId = session.metadata?.order_id || session.client_reference_id || '';
      const order = getDb().orders.find((candidate) => candidate.id === orderId);
      const expectedCents = order ? Math.round(order.total * 100) : -1;
      if (
        stripeResponse.ok &&
        order &&
        order.paymentReference === session.id &&
        session.payment_status === 'paid' &&
        session.currency === 'brl' &&
        session.amount_total === expectedCents &&
        updateStripeOrder(order.id, 'paid')
      ) {
        return res.redirect(`${appUrl}/?pagamento=confirmado`);
      }
      return res.redirect(`${appUrl}/?pagamento=pendente`);
    } catch {
      return res.redirect(`${appUrl}/?pagamento=erro`);
    }
  });

  // ---------------------------------------------------------------------------
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC FILES
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  return app;
}

export const appReady = createApp();

if (process.env.VERCEL !== '1') {
  appReady.then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`TinaVitrine server running on http://localhost:${PORT}`);
    });
  }).catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
