import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTrackedBuyLink,
  calculateCompetitivePrice,
  calculateSavingsPercent,
  filterAndSortProducts,
  hasPermission,
  slugifyProductName,
} from './commerce';
import type { Product, RolePermissionsMap } from '../types';

const sampleProducts: Product[] = [
  {
    id: 'p1',
    slug: 'fone-anc',
    name: 'Fone Bluetooth ANC Pro',
    description: 'Cancelamento ativo de ruído com 40h de bateria.',
    category: 'Áudio',
    tags: ['bluetooth', 'anc', 'home-office'],
    price: 499,
    minMarketPrice: 450,
    maxMarketPrice: 680,
    avgMarketPrice: 560,
    imageUrl: '/img1.jpg',
    stock: 15,
    featured: true,
    sources: [],
    clicksFromSocial: 42,
    salesCount: 12,
    createdBy: 'u1',
    createdAt: '2026-11-10T10:00:00Z',
  },
  {
    id: 'p2',
    slug: 'teclado-mecanico',
    name: 'Teclado Mecânico 75%',
    description: 'Switches táteis silenciosos sem fio.',
    category: 'Periféricos',
    tags: ['teclado', 'home-office', 'setup'],
    price: 349,
    minMarketPrice: 310,
    maxMarketPrice: 490,
    avgMarketPrice: 390,
    imageUrl: '/img2.jpg',
    stock: 8,
    featured: false,
    sources: [],
    clicksFromSocial: 18,
    salesCount: 25,
    createdBy: 'u1',
    createdAt: '2026-11-12T10:00:00Z',
  },
];

const sampleMatrix: RolePermissionsMap = {
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

test('slugifyProductName strips accents and normalizes dashes', () => {
  assert.equal(slugifyProductName('Cafeteira Expresso Inox 220V!'), 'cafeteira-expresso-inox-220v');
});

test('calculateCompetitivePrice derives suggested price below average and >= min', () => {
  const res = calculateCompetitivePrice(400, 500, 700);
  assert.equal(res.suggested, 470);
  assert.equal(res.savingsVsAvgPercent, 6);

  const clamped = calculateCompetitivePrice(490, 500, 700);
  assert.equal(clamped.suggested, 490);
});

test('calculateSavingsPercent returns 0 when storePrice >= market avg', () => {
  assert.equal(calculateSavingsPercent(500, 500), 0);
  assert.equal(calculateSavingsPercent(450, 500), 10);
});

test('filterAndSortProducts filters by category, tag, price range and sorts accurately', () => {
  const byTag = filterAndSortProducts(sampleProducts, {
    search: '',
    category: 'todas',
    tag: 'home-office',
    minPrice: null,
    maxPrice: null,
    sortBy: 'price_asc',
  });
  assert.equal(byTag.length, 2);
  assert.equal(byTag[0].id, 'p2');

  const byCat = filterAndSortProducts(sampleProducts, {
    search: '',
    category: 'Áudio',
    tag: '',
    minPrice: 400,
    maxPrice: 600,
    sortBy: 'newest',
  });
  assert.equal(byCat.length, 1);
  assert.equal(byCat[0].id, 'p1');
});

test('buildTrackedBuyLink creates clean product URL with ref query', () => {
  const link = buildTrackedBuyLink('https://loja.exemplo.com/', 'p1', 'fb_grupo_ofertas');
  assert.equal(link, 'https://loja.exemplo.com/?produto=p1&ref=fb_grupo_ofertas');
});

test('hasPermission always grants creator and respects role matrix for others', () => {
  assert.equal(hasPermission('creator', 'manage_gateways', sampleMatrix), true);
  assert.equal(hasPermission('admin', 'manage_gateways', sampleMatrix), false);
  assert.equal(hasPermission('admin', 'ai_research', sampleMatrix), true);
  assert.equal(hasPermission('user', 'create_products', sampleMatrix), false);
  assert.equal(hasPermission('guest', 'buy_products', sampleMatrix), true);
});
