import { useState } from 'react';
import { Pencil, ShoppingBag, X } from 'lucide-react';
import type { Product } from '../types';
import { formatBRL } from '../utils/commerce';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onSelectCategory: (category: string) => void;
  onSelectTag: (tag: string) => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onBuyNow: (product: Product, quantity: number) => void;
  canBuy: boolean;
  canEdit: boolean;
  onEdit: (product: Product) => void;
}

export function ProductDetailModal({
  product,
  onClose,
  onSelectCategory,
  onSelectTag,
  onAddToCart,
  onBuyNow,
  canBuy,
  canEdit,
  onEdit,
}: ProductDetailModalProps) {
  const [quantity, setQuantity] = useState(1);

  if (!product) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdp-title"
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => {
              onSelectCategory(product.category);
              onClose();
            }}
            className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
          >
            Categoria: {product.category}
          </button>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(product)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Editar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhes do produto"
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 p-6 md:grid-cols-12">
          <div className="md:col-span-6">
            <div className="aspect-[4/3] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800">
              <img
                src={product.imageUrl}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>

          </div>

          <div className="flex flex-col md:col-span-6">
            <h2 id="pdp-title" className="text-2xl font-bold text-zinc-950 dark:text-white">
              {product.name}
            </h2>

            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {product.description}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Tags:</span>
              {product.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    onSelectTag(tag);
                    onClose();
                  }}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-blue-500 hover:text-blue-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-blue-400 cursor-pointer"
                >
                  #{tag}
                </button>
              ))}
            </div>

            {/* Market Price Research Summary */}
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-3xl font-bold tabular-nums text-zinc-950 dark:text-white">
                  {formatBRL(product.price)}
                </p>
              </div>

            </div>

            {/* Purchase Controls */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex items-center rounded-lg border border-zinc-300 dark:border-zinc-700">
                <button
                  type="button"
                  aria-label="Diminuir quantidade"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  −
                </button>
                <span className="px-3 font-mono text-sm tabular-nums text-zinc-900 dark:text-white">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Aumentar quantidade"
                  onClick={() => setQuantity((q) => Math.min(Math.max(1, product.stock), q + 1))}
                  className="px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                disabled={!canBuy || product.stock <= 0}
                onClick={() => {
                  onAddToCart(product, quantity);
                  onClose();
                }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800 cursor-pointer"
              >
                <ShoppingBag className="h-4 w-4" />
                Adicionar à Sacola
              </button>

              <button
                type="button"
                disabled={!canBuy || product.stock <= 0}
                onClick={() => {
                  onBuyNow(product, quantity);
                  onClose();
                }}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                Comprar Agora
              </button>
            </div>
            {!canBuy && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                A compra está desativada para o cargo atual na matriz de permissões.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
