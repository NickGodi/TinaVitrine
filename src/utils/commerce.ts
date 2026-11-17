import type { PermissionKey, Product, ProductFilterOptions, Role, RolePermissionsMap } from '../types';

export function formatBRL(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(safe);
}

export function slugifyProductName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'produto';
}

export function calculateCompetitivePrice(minPrice: number, avgPrice: number, maxPrice: number): {
  min: number;
  avg: number;
  max: number;
  suggested: number;
  savingsVsAvgPercent: number;
} {
  const cleanMin = Math.max(1, Number(minPrice) || 0);
  const cleanMax = Math.max(cleanMin, Number(maxPrice) || cleanMin);
  const cleanAvg = Math.min(cleanMax, Math.max(cleanMin, Number(avgPrice) || (cleanMin + cleanMax) / 2));

  // Position store price ~6% below market average while staying >= minPrice
  const rawSuggested = Math.max(cleanMin, Math.round(cleanAvg * 0.94));
  const savingsVsAvgPercent = cleanAvg > 0
    ? Math.max(0, Math.round(((cleanAvg - rawSuggested) / cleanAvg) * 100))
    : 0;

  return {
    min: Number(cleanMin.toFixed(2)),
    avg: Number(cleanAvg.toFixed(2)),
    max: Number(cleanMax.toFixed(2)),
    suggested: Number(rawSuggested.toFixed(2)),
    savingsVsAvgPercent,
  };
}

export function calculateSavingsPercent(storePrice: number, avgMarketPrice: number): number {
  if (!Number.isFinite(storePrice) || !Number.isFinite(avgMarketPrice) || avgMarketPrice <= 0) {
    return 0;
  }
  if (storePrice >= avgMarketPrice) return 0;
  return Math.round(((avgMarketPrice - storePrice) / avgMarketPrice) * 100);
}

export function buildTrackedBuyLink(baseOrigin: string, productId: string, sourceTag?: string): string {
  const cleanOrigin = baseOrigin.replace(/\/+$/, '');
  const url = new URL(`${cleanOrigin}/`);
  url.searchParams.set('produto', productId);
  if (sourceTag && sourceTag.trim()) {
    url.searchParams.set('ref', sourceTag.trim());
  }
  return url.toString();
}

export function filterAndSortProducts(products: Product[], options: ProductFilterOptions): Product[] {
  const searchLower = options.search.trim().toLowerCase();
  const categoryLower = options.category.trim().toLowerCase();
  const tagLower = options.tag.trim().toLowerCase();

  const filtered = products.filter((p) => {
    if (categoryLower && categoryLower !== 'todas' && p.category.toLowerCase() !== categoryLower) {
      return false;
    }
    if (tagLower && !p.tags.some((t) => t.toLowerCase() === tagLower)) {
      return false;
    }
    if (options.minPrice !== null && p.price < options.minPrice) {
      return false;
    }
    if (options.maxPrice !== null && p.price > options.maxPrice) {
      return false;
    }
    if (searchLower) {
      const haystack = `${p.name} ${p.description} ${p.category} ${p.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(searchLower)) {
        return false;
      }
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (options.sortBy) {
      case 'price_asc':
        return a.price - b.price;
      case 'price_desc':
        return b.price - a.price;
      case 'popular':
        return (b.salesCount + b.clicksFromSocial) - (a.salesCount + a.clicksFromSocial);
      case 'newest':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
}

export function hasPermission(
  role: Role,
  permission: PermissionKey,
  matrix: RolePermissionsMap
): boolean {
  if (role === 'creator') {
    return true;
  }
  return Boolean(matrix[role]?.[permission]);
}

export function calculateGatewayFee(subtotal: number, feePercent: number): {
  fee: number;
  total: number;
} {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const safeFeePercent = Math.max(0, Number(feePercent) || 0);
  const fee = Number(((safeSubtotal * safeFeePercent) / 100).toFixed(2));
  return {
    fee,
    total: Number(safeSubtotal.toFixed(2)),
  };
}
