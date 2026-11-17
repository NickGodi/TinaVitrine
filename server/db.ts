import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import type {
  DatabaseSchema,
  PermissionKey,
  Role,
  RolePermissionsMap,
  StoredUser,
} from './types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

export interface DatabaseRequestContext {
  db: DatabaseSchema;
  version: number;
  dirty: boolean;
}

export const databaseRequestContext = new AsyncLocalStorage<DatabaseRequestContext>();

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const keyBuf = Buffer.from(key, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function sanitizeUser(user: StoredUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    banned: user.banned,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    bio: user.bio,
    city: user.city,
    phone: user.phone,
  };
}

export const DEFAULT_ROLE_MATRIX: RolePermissionsMap = {
  creator: {
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
  },
  admin: {
    view_store: true,
    buy_products: true,
    create_products: true,
    edit_products: true,
    delete_products: false,
    ai_research: true,
    social_autopost: true,
    manage_gateways: false,
    view_orders: true,
    view_analytics: true,
  },
  user: {
    view_store: true,
    buy_products: true,
    create_products: false,
    edit_products: false,
    delete_products: false,
    ai_research: false,
    social_autopost: false,
    manage_gateways: false,
    view_orders: false,
    view_analytics: false,
  },
  guest: {
    view_store: true,
    buy_products: true,
    create_products: false,
    edit_products: false,
    delete_products: false,
    ai_research: false,
    social_autopost: false,
    manage_gateways: false,
    view_orders: false,
    view_analytics: false,
  },
};

export function createInitialDb(): DatabaseSchema {
  const now = new Date().toISOString();
  const creatorId = 'usr_creator_nicolas';
  const initialUsername = process.env.INITIAL_CREATOR_USERNAME?.trim();
  const initialPassword = process.env.INITIAL_CREATOR_PASSWORD ?? '';
  const initialCreator = initialUsername && /^[\p{L}\p{N}._-]{3,32}$/u.test(initialUsername) && initialPassword.length >= 16 && initialPassword.length <= 128
    ? {
        id: creatorId,
        username: initialUsername,
        displayName: process.env.INITIAL_CREATOR_NAME?.trim() || 'Criador TinaVitrine',
        passwordHash: hashPassword(initialPassword),
        role: 'creator' as const,
        banned: false,
        createdAt: now,
        lastLoginAt: null,
        bio: '',
        city: '',
        phone: '',
      }
    : null;

  return {
    users: initialCreator ? [initialCreator] : [],
    sessions: [],
    roleMatrix: structuredClone(DEFAULT_ROLE_MATRIX),
    products: [
      {
        id: 'prod_fone_anc',
        slug: 'fone-wireless-studio-anc',
        name: 'Fone Wireless Studio ANC',
        description:
          'Headphone sem fio com cancelamento ativo de ruído híbrido, drivers de 40mm de alta definição e autonomia de até 42 horas. Ideal para foco no trabalho, viagens e chamadas cristalinas.',
        category: 'Áudio',
        tags: ['bluetooth', 'anc', 'home-office', 'premium'],
        price: 549.0,
        minMarketPrice: 489.0,
        maxMarketPrice: 749.0,
        avgMarketPrice: 615.0,
        imageUrl: '/src/assets/images/product_fone_anc_1794903448625.jpg',
        stock: 18,
        featured: true,
        sources: [
          { title: 'Comparador Google Shopping — Fones ANC', uri: 'https://shopping.google.com' },
        ],
        clicksFromSocial: 148,
        salesCount: 24,
        createdBy: creatorId,
        createdAt: '2026-11-05T10:00:00.000Z',
      },
      {
        id: 'prod_smartwatch_pro',
        slug: 'smartwatch-titanio-series-x',
        name: 'Smartwatch Titânio Series X',
        description:
          'Relógio inteligente em caixa de titânio escovado, monitoramento contínuo de batimentos, GPS de dupla frequência e pulseira esportiva respirável resistente à água (5 ATM).',
        category: 'Wearables',
        tags: ['smartwatch', 'fitness', 'titanio', 'gps'],
        price: 890.0,
        minMarketPrice: 820.0,
        maxMarketPrice: 1290.0,
        avgMarketPrice: 990.0,
        imageUrl: '/src/assets/images/product_smartwatch_pro_1794903449754.jpg',
        stock: 12,
        featured: true,
        sources: [
          { title: 'Pesquisa de Mercado — Smartwatches Titânio', uri: 'https://shopping.google.com' },
        ],
        clicksFromSocial: 210,
        salesCount: 19,
        createdBy: creatorId,
        createdAt: '2026-11-08T12:30:00.000Z',
      },
      {
        id: 'prod_cafeteira_espresso',
        slug: 'cafeteira-espresso-barista-inox',
        name: 'Cafeteira Espresso Barista Inox',
        description:
          'Máquina de café espresso semi-automática em aço inox escovado com bomba italiana de 15 bar, manômetro frontal de pressão e vaporizador articulado para cappuccinos cremosos.',
        category: 'Casa & Cozinha',
        tags: ['cafe', 'espresso', 'inox', 'cozinha'],
        price: 1690.0,
        minMarketPrice: 1540.0,
        maxMarketPrice: 2350.0,
        avgMarketPrice: 1890.0,
        imageUrl: '/src/assets/images/product_cafeteira_espresso_1794903448826.jpg',
        stock: 7,
        featured: true,
        sources: [
          { title: 'Referência de Preços — Cafeteiras Espresso Inox', uri: 'https://shopping.google.com' },
        ],
        clicksFromSocial: 96,
        salesCount: 9,
        createdBy: creatorId,
        createdAt: '2026-11-10T15:00:00.000Z',
      },
      {
        id: 'prod_mochila_tech',
        slug: 'mochila-urbana-impermeavel-24l',
        name: 'Mochila Urbana Impermeável 24L',
        description:
          'Mochila estruturada em tecido balístico resistente à água com compartimento acolchoado para notebook de até 16 polegadas, zíperes selados e fivela magnética rápida.',
        category: 'Acessórios',
        tags: ['mochila', 'viagem', 'home-office', 'impermeavel'],
        price: 329.0,
        minMarketPrice: 279.0,
        maxMarketPrice: 449.0,
        avgMarketPrice: 365.0,
        imageUrl: '/src/assets/images/product_mochila_tech_1794903450723.jpg',
        stock: 25,
        featured: false,
        sources: [
          { title: 'Pesquisa Google — Mochilas Notebook Impermeáveis', uri: 'https://shopping.google.com' },
        ],
        clicksFromSocial: 174,
        salesCount: 31,
        createdBy: creatorId,
        createdAt: '2026-11-11T09:40:00.000Z',
      },
      {
        id: 'prod_teclado_mecanico',
        slug: 'teclado-mecanico-75-wireless',
        name: 'Teclado Mecânico 75% Wireless',
        description:
          'Teclado mecânico compacto layout 75% com estrutura em alumínio, keycaps PBT bicolor, switches lineares lubrificados de fábrica e conexão tri-mode (Bluetooth, 2.4GHz e USB-C).',
        category: 'Periféricos',
        tags: ['teclado', 'setup', 'home-office', 'bluetooth'],
        price: 419.0,
        minMarketPrice: 369.0,
        maxMarketPrice: 589.0,
        avgMarketPrice: 465.0,
        imageUrl: '/src/assets/images/product_teclado_mecanico_1794903449860.jpg',
        stock: 14,
        featured: false,
        sources: [
          { title: 'Pesquisa Google — Teclados Mecânicos 75%', uri: 'https://shopping.google.com' },
        ],
        clicksFromSocial: 132,
        salesCount: 22,
        createdBy: creatorId,
        createdAt: '2026-11-13T16:20:00.000Z',
      },
    ],
    socialAccounts: [],
    socialPosts: [],
    gateways: [
      {
        id: 'gw_pix',
        provider: 'pix',
        name: 'PIX Instantâneo (Banco Central)',
        enabled: true,
        mode: 'production',
        feePercent: 0.99,
        settlementTime: 'Imediato',
        merchantKeyMasked: '',
        webhookUrl: 'Confirmação manual',
      },
      {
        id: 'gw_mercadopago',
        provider: 'mercadopago',
        name: 'Mercado Pago Checkout',
        enabled: false,
        mode: 'production',
        feePercent: 3.49,
        settlementTime: '1 dia útil',
        merchantKeyMasked: '',
        webhookUrl: 'Não configurado',
      },
      {
        id: 'gw_stripe',
        provider: 'stripe',
        name: 'Stripe Cartão de Crédito',
        enabled: false,
        mode: 'production',
        feePercent: 3.99,
        settlementTime: '2 dias úteis',
        merchantKeyMasked: '',
        webhookUrl: '/api/webhooks/stripe',
      },
      {
        id: 'gw_pagbank',
        provider: 'pagbank',
        name: 'PagBank / PagSeguro',
        enabled: false,
        mode: 'sandbox',
        feePercent: 3.19,
        settlementTime: '14 dias',
        merchantKeyMasked: '',
        webhookUrl: 'Não configurado',
      },
    ],
    orders: [],
  };
}

let cachedDb: DatabaseSchema | null = null;

export function getDb(): DatabaseSchema {
  const requestContext = databaseRequestContext.getStore();
  if (requestContext) return requestContext.db;
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    cachedDb = createInitialDb();
    saveDb(cachedDb);
    return cachedDb;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    cachedDb = JSON.parse(raw) as DatabaseSchema;
    // Ensure roleMatrix has all keys
    for (const r of ['creator', 'admin', 'user', 'guest'] as Role[]) {
      if (!cachedDb.roleMatrix[r]) {
        cachedDb.roleMatrix[r] = { ...DEFAULT_ROLE_MATRIX[r] };
      } else {
        for (const k of Object.keys(DEFAULT_ROLE_MATRIX[r]) as PermissionKey[]) {
          if (typeof cachedDb.roleMatrix[r][k] !== 'boolean') {
            cachedDb.roleMatrix[r][k] = DEFAULT_ROLE_MATRIX[r][k];
          }
        }
      }
    }
    return cachedDb;
  } catch {
    cachedDb = createInitialDb();
    saveDb(cachedDb);
    return cachedDb;
  }
}

export function saveDb(db: DatabaseSchema): void {
  const requestContext = databaseRequestContext.getStore();
  if (requestContext) {
    requestContext.db = db;
    requestContext.dirty = true;
    cachedDb = db;
    return;
  }
  cachedDb = db;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_PATH}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpPath, DB_PATH);
}

export function roleHasPermission(role: Role, permission: PermissionKey, db: DatabaseSchema): boolean {
  if (role === 'creator') return true;
  return Boolean(db.roleMatrix[role]?.[permission]);
}
