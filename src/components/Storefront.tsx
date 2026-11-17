import { useState } from 'react';
import { Package, Search, ShoppingBag, SlidersHorizontal, X } from 'lucide-react';
import type { Product, ProductFilterOptions } from '../types';
import { filterAndSortProducts, formatBRL } from '../utils/commerce';

interface StorefrontProps {
  products: Product[];
  filters: ProductFilterOptions;
  onChangeFilters: (next: ProductFilterOptions) => void;
  onSelectCategory: (category: string) => void;
  onOpenProduct: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  canBuy: boolean;
  canOpenPanel: boolean;
  onOpenPanel: () => void;
  catalogRef: React.RefObject<HTMLElement | null>;
}

function ProductImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
        <Package className="h-10 w-10" aria-hidden="true" />
        <span className="mt-2 px-4 text-center text-xs font-medium">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
    />
  );
}

export function Storefront({
  products,
  filters,
  onChangeFilters,
  onSelectCategory,
  onOpenProduct,
  onAddToCart,
  canBuy,
  canOpenPanel,
  onOpenPanel,
  catalogRef,
}: StorefrontProps) {
  const categories = ['Todas', ...Array.from(new Set(products.map((p) => p.category))).sort()];
  const visibleProducts = filterAndSortProducts(products, filters);

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    (filters.category !== '' && filters.category !== 'Todas') ||
    filters.tag !== '' ||
    filters.minPrice !== null ||
    filters.maxPrice !== null;

  function resetFilters() {
    onChangeFilters({
      search: '',
      category: 'Todas',
      tag: '',
      minPrice: null,
      maxPrice: null,
      sortBy: 'newest',
    });
  }

  return (
    <div className="bg-white dark:bg-zinc-950">
      {/* Catalog & Filters Section */}
      <section
        ref={catalogRef}
        id="catalogo"
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
              Produtos em Destaque
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {filters.tag ? (
                <>
                  Produtos relacionados à tag <span className="font-medium">#{filters.tag}</span>.
                </>
              ) : (
                'Clique em uma categoria para filtrar produtos semelhantes.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {canOpenPanel && (
              <button
                type="button"
                onClick={onOpenPanel}
                className="rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900 cursor-pointer whitespace-nowrap"
              >
                Estúdio IA &amp; Facebook
              </button>
            )}
            <p className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {visibleProducts.length} de {products.length} produtos exibidos
            </p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="mt-6 space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12">
            {/* Search */}
            <div className="relative sm:col-span-2 xl:col-span-4">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <label htmlFor="store-search" className="sr-only">
                Buscar produtos
              </label>
              <input
                id="store-search"
                type="search"
                value={filters.search}
                onChange={(e) => onChangeFilters({ ...filters, search: e.target.value })}
                placeholder="Buscar por nome, descrição ou categoria..."
                className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-3 pl-9 text-sm text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            </div>

            {/* Min / Max Price */}
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 xl:col-span-4">
              <div>
                <label htmlFor="filter-min-price" className="sr-only">
                  Preço mínimo
                </label>
                <input
                  id="filter-min-price"
                  type="number"
                  min={0}
                  value={filters.minPrice ?? ''}
                  onChange={(e) =>
                    onChangeFilters({
                      ...filters,
                      minPrice: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Preço mín (R$)"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="filter-max-price" className="sr-only">
                  Preço máximo
                </label>
                <input
                  id="filter-max-price"
                  type="number"
                  min={0}
                  value={filters.maxPrice ?? ''}
                  onChange={(e) =>
                    onChangeFilters({
                      ...filters,
                      maxPrice: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Preço máx (R$)"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
              </div>
            </div>

            {/* Category */}
            <div className="sm:col-span-1 xl:col-span-2">
              <label htmlFor="store-category-filter" className="sr-only">
                Filtrar por categoria
              </label>
              <select
                id="store-category-filter"
                value={filters.category || 'Todas'}
                onChange={(event) => onSelectCategory(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              >
                <option value="Todas">Todas as categorias</option>
                {categories
                  .filter((category) => category !== 'Todas')
                  .map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
              </select>
            </div>

            {/* Sort */}
            <div className="sm:col-span-1 xl:col-span-2">
              <label htmlFor="store-sort" className="sr-only">
                Ordenar por
              </label>
              <div className="relative">
                <SlidersHorizontal
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <select
                  id="store-sort"
                  value={filters.sortBy}
                  onChange={(e) =>
                    onChangeFilters({
                      ...filters,
                      sortBy: e.target.value as ProductFilterOptions['sortBy'],
                    })
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-3 pl-9 text-sm text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                >
                  <option value="newest">Mais recentes</option>
                  <option value="price_asc">Menor preço</option>
                  <option value="price_desc">Maior preço</option>
                  <option value="popular">Mais populares</option>
                </select>
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex justify-end border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </button>
            </div>
          )}
        </div>

        {/* Product Grid */}
        {visibleProducts.length === 0 ? (
          <div className="mt-10 rounded-xl border border-zinc-200 bg-zinc-50 p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-base font-semibold text-zinc-900 dark:text-white">
              Nenhum produto encontrado com esses filtros.
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Tente limpar os filtros ou buscar por outra categoria.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 cursor-pointer"
            >
              Ver todos os produtos
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProducts.map((product) => {
              return (
                <article
                  key={product.id}
                  data-testid={`product-card-${product.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProduct(product)}
                    className="aspect-[4/3] w-full overflow-hidden bg-zinc-100 text-left dark:bg-zinc-800 cursor-pointer"
                    aria-label={`Ver detalhes de ${product.name}`}
                  >
                    <ProductImage src={product.imageUrl} alt={product.name} />
                  </button>

                  <div className="flex flex-1 flex-col p-5">
                    {/* Unboxed interactive category + metadata */}
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <button
                        type="button"
                        onClick={() => onSelectCategory(product.category)}
                        className="font-semibold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                      >
                        {product.category}
                      </button>
                      <span className="font-mono tabular-nums">
                        {product.stock > 0 ? `${product.stock} em estoque` : 'Esgotado'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenProduct(product)}
                      className="mt-2 text-left text-base font-semibold text-zinc-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400 cursor-pointer"
                    >
                      {product.name}
                    </button>

                    <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-300">
                      {product.description.split('\n\n')[0]}
                    </p>

                    <div className="mt-auto border-t border-zinc-100 pt-4 dark:border-zinc-800">
                      <div>
                        <span className="font-mono text-lg font-bold tabular-nums text-zinc-950 dark:text-white">
                          {formatBRL(product.price)}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenProduct(product)}
                          className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                        >
                          Ver Oferta
                        </button>
                        <button
                          type="button"
                          disabled={!canBuy || product.stock <= 0}
                          onClick={() => onAddToCart(product)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                          Comprar
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
