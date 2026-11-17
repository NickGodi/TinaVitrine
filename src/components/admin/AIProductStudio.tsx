import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  ImageOff,
  Pencil,
  Search,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../../api';
import type { Product } from '../../types';
import { buildTrackedBuyLink, formatBRL } from '../../utils/commerce';

interface AIProductStudioProps {
  products: Product[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUseAI: boolean;
  initialEditProductId: string | null;
  onInitialEditHandled: () => void;
  onProductsChanged: () => Promise<void>;
  onSendToFacebook: (product: Product, suggestedCaption?: string) => void;
}

type ProductSortKey =
  | 'name'
  | 'category'
  | 'price'
  | 'avgMarketPrice'
  | 'clicksFromSocial'
  | 'createdAt';
type ProductSortOption = 'recent' | 'clicks' | 'price' | 'name' | 'custom';

const DEFAULT_PRODUCT_IMAGE = '/src/assets/images/product_fone_anc_1794903448625.jpg';

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function AIProductStudio({
  products,
  canCreate,
  canEdit,
  canDelete,
  canUseAI,
  initialEditProductId,
  onInitialEditHandled,
  onProductsChanged,
  onSendToFacebook,
}: AIProductStudioProps) {
  const [query, setQuery] = useState('');
  const [uploadedPreview, setUploadedPreview] = useState<string>('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [price, setPrice] = useState('');
  const [minMarketPrice, setMinMarketPrice] = useState('');
  const [maxMarketPrice, setMaxMarketPrice] = useState('');
  const [avgMarketPrice, setAvgMarketPrice] = useState('');
  const [imageUrl, setImageUrl] = useState(DEFAULT_PRODUCT_IMAGE);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [stock, setStock] = useState('15');
  const [sources, setSources] = useState<Array<{ title: string; uri: string }>>([]);
  const [suggestedFbCaption, setSuggestedFbCaption] = useState('');

  const [researching, setResearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<ProductSortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [sortOption, setSortOption] = useState<ProductSortOption>('recent');
  const lastAutoResearchedImageUrl = useRef('');

  const handleResearchAI = useCallback(async (imageInput?: { imageUrl?: string; imageDataUrl?: string }) => {
    const imageSourceUrl = imageInput?.imageUrl?.trim() || '';
    const imageDataUrl = imageInput?.imageDataUrl || '';

    setError('');
    setSuccessMsg('');
    if (!canUseAI) {
      setError('Seu cargo não tem permissão para pesquisar produtos com IA.');
      return;
    }
    if (!query.trim() && !imageSourceUrl && !imageDataUrl) {
      setError('Digite o nome do produto, cole/envie uma foto ou informe a URL direta de uma imagem.');
      return;
    }
    if (imageSourceUrl && !isHttpUrl(imageSourceUrl)) {
      setError('Informe uma URL direta de imagem válida, começando com http:// ou https://.');
      return;
    }
    if (imageSourceUrl) lastAutoResearchedImageUrl.current = imageSourceUrl;

    setResearching(true);
    try {
      const res = await api.researchProductAI({
        query: query.trim() || undefined,
        imageUrl: imageSourceUrl || undefined,
        imageDataUrl: imageDataUrl || undefined,
      });
      const r = res.result;
      setName(r.name);
      setDescription(r.description);
      setCategory(r.category);
      setTagsInput(r.tags.join(', '));
      setPrice(r.suggestedPrice === null ? '' : String(r.suggestedPrice));
      setMinMarketPrice(r.minPrice === null ? '' : String(r.minPrice));
      setMaxMarketPrice(r.maxPrice === null ? '' : String(r.maxPrice));
      setAvgMarketPrice(r.avgPrice === null ? '' : String(r.avgPrice));
      if (r.imageUrl) setImageUrl(r.imageUrl);
      setSources(r.sources || []);
      setSuggestedFbCaption(r.facebookCaption || '');
      setSuccessMsg(r.priceCount >= 2
        ? `Pesquisa Tavily concluída com ${r.priceCount} preços encontrados.`
        : 'Pesquisa Tavily concluída. Não encontrei preços suficientes para calcular uma média; confira as fontes e preencha o preço manualmente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao pesquisar o produto na web.');
    } finally {
      setResearching(false);
    }
  }, [canUseAI, query]);

  const handleImageFile = useCallback((file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use uma imagem JPEG, PNG ou WebP para pesquisar o produto.');
      return;
    }
    if (file.size > 7 * 1024 * 1024) {
      setError('A imagem precisa ter até 7 MB para o reconhecimento automático.');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setUploadedPreview(dataUrl);
      setImageUrl(dataUrl);
      setImageUrlInput('');
      lastAutoResearchedImageUrl.current = '';
      void handleResearchAI({ imageDataUrl: dataUrl });
    };
    reader.onerror = () => setError('Não foi possível carregar essa imagem. Tente novamente.');
    reader.readAsDataURL(file);
  }, [handleResearchAI]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleImageFile(file);
    e.target.value = '';
  }

  useEffect(() => {
    function handleWindowPaste(event: ClipboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input:not([type="file"]), textarea, select, [contenteditable="true"]')
      ) {
        return;
      }

      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) =>
        item.type.startsWith('image/')
      );
      const file = imageItem?.getAsFile();
      if (!file) return;

      event.preventDefault();
      handleImageFile(file);
    }

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [handleImageFile]);

  async function handleSaveProduct(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSaving(true);
    try {
      if (!imageUrl.trim()) {
        throw new Error('Envie uma foto do produto ou pesquise uma página que forneça uma imagem.');
      }

      const tags = tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean);

      const payload: Partial<Product> = {
        name,
        description,
        category: category || 'Eletrônicos',
        tags,
        price: Number(price),
        minMarketPrice: Math.max(0, Number(minMarketPrice) || 0),
        maxMarketPrice: Math.max(0, Number(maxMarketPrice) || 0),
        avgMarketPrice: Math.max(0, Number(avgMarketPrice) || 0),
        imageUrl: imageUrl.trim(),
        stock: Number(stock) || 10,
        featured: true,
        sources,
      };

      const saved = editingProductId
        ? await api.updateProduct(editingProductId, payload)
        : await api.createProduct(payload);

      await onProductsChanged();
      setSuccessMsg(
        editingProductId
          ? `Produto "${saved.product.name}" atualizado na vitrine.`
          : `Produto "${saved.product.name}" publicado na vitrine com link direto!`
      );
      clearProductForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar produto.');
    } finally {
      setSaving(false);
    }
  }

  function clearProductForm() {
    setEditingProductId(null);
    setName('');
    setDescription('');
    setCategory('');
    setTagsInput('');
    setPrice('');
    setMinMarketPrice('');
    setMaxMarketPrice('');
    setAvgMarketPrice('');
    setImageUrl(DEFAULT_PRODUCT_IMAGE);
    setImageUrlInput('');
    lastAutoResearchedImageUrl.current = '';
    setStock('15');
    setSources([]);
    setQuery('');
    setUploadedPreview('');
    setSuggestedFbCaption('');
  }

  const handleEditProduct = useCallback((product: Product) => {
    setEditingProductId(product.id);
    setName(product.name);
    setDescription(product.description);
    setCategory(product.category);
    setTagsInput(product.tags.join(', '));
    setPrice(String(product.price));
    setMinMarketPrice(String(product.minMarketPrice));
    setMaxMarketPrice(String(product.maxMarketPrice));
    setAvgMarketPrice(String(product.avgMarketPrice));
    setImageUrl(product.imageUrl);
    setImageUrlInput('');
    lastAutoResearchedImageUrl.current = '';
    setStock(String(product.stock));
    setSources(product.sources || []);
    setQuery('');
    setUploadedPreview('');
    setError('');
    setSuccessMsg(`Editando "${product.name}". Altere os campos e salve as mudanças.`);
    document.getElementById('prod-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  useEffect(() => {
    if (!initialEditProductId) return;
    const product = products.find((item) => item.id === initialEditProductId);
    if (!product) return;
    handleEditProduct(product);
    onInitialEditHandled();
  }, [initialEditProductId, products, handleEditProduct, onInitialEditHandled]);

  async function handleDeleteProduct(id: string) {
    try {
      await api.deleteProduct(id);
      await onProductsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir produto.');
    }
  }

  function handleSort(key: ProductSortKey) {
    if (sortBy === key) {
      setSortDirection((direction) => (direction === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(key);
      setSortDirection('desc');
    }
    setSortOption('custom');
  }

  function handleSortOptionChange(option: ProductSortOption) {
    setSortOption(option);
    if (option === 'recent') {
      setSortBy('createdAt');
      setSortDirection('desc');
    } else if (option === 'clicks') {
      setSortBy('clicksFromSocial');
      setSortDirection('desc');
    } else if (option === 'price') {
      setSortBy('price');
      setSortDirection('desc');
    } else if (option === 'name') {
      setSortBy('name');
      setSortDirection('asc');
    }
  }

  const sortedProducts = [...products].sort((a, b) => {
    const left = a[sortBy];
    const right = b[sortBy];
    const comparison =
      sortBy === 'createdAt'
        ? Date.parse(String(left)) - Date.parse(String(right))
        : typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'pt-BR', { sensitivity: 'base' });
    return sortDirection === 'desc' ? -comparison : comparison;
  });

  function renderSortHeader(label: string, key: ProductSortKey, alignRight = false) {
    const SortIcon = sortBy === key
      ? sortDirection === 'desc' ? ChevronDown : ChevronUp
      : ArrowDownUp;
    return (
      <button
        type="button"
        onClick={() => handleSort(key)}
        className={`inline-flex items-center gap-1 font-medium hover:text-zinc-900 dark:hover:text-white ${alignRight ? 'justify-end' : ''}`}
      >
        {label}
        <SortIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="space-y-8">
      {/* AI Research & Product Creation Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Pesquisa de Produto por Nome ou Imagem
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Cole ou envie uma foto, ou informe a URL direta da imagem. O site identifica o produto e pesquisa preços semelhantes na web.
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
          >
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            {successMsg}
          </div>
        )}

        {/* Step 1: Product photo or direct image URL */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              1. Foto do Produto
            </label>
            <div
              tabIndex={0}
              aria-label="Área para enviar ou colar uma imagem do produto"
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {uploadedPreview || imageUrl ? (
                <img
                  src={uploadedPreview || imageUrl}
                  alt="Prévia do produto"
                  className="mb-3 h-56 w-full rounded-lg bg-zinc-100 object-contain dark:bg-zinc-800"
                />
              ) : null}

              <label
                htmlFor="product-photo-upload"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Upload className="h-3.5 w-3.5" />
                Enviar Foto do Produto
                <input
                  id="product-photo-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                Cole uma imagem com Ctrl+V ou envie um JPEG, PNG ou WebP de até 7 MB. O site identifica o produto e inicia a pesquisa automaticamente.
              </p>
              <div className="mt-3 w-full text-left">
                <label
                  htmlFor="product-image-url"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Ou informe a URL direta da imagem
                </label>
                <input
                  id="product-image-url"
                  type="url"
                  value={imageUrlInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setImageUrlInput(value);
                    lastAutoResearchedImageUrl.current = '';
                    setUploadedPreview('');
                    setImageUrl('');
                    setError('');
                    setSuccessMsg('');
                  }}
                  onBlur={(event) => {
                    const value = imageUrlInput.trim();
                    const nextTarget = event.relatedTarget;
                    if (
                      nextTarget instanceof HTMLElement &&
                      nextTarget.closest('#ai-research-button')
                    ) {
                      return;
                    }
                    if (!value || !isHttpUrl(value)) return;
                    if (lastAutoResearchedImageUrl.current === value) return;
                    lastAutoResearchedImageUrl.current = value;
                    setImageUrl(value);
                    void handleResearchAI({ imageUrl: value });
                  }}
                  placeholder="https://cdn.loja.com/imagem-do-produto.jpg"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Ao sair do campo, a imagem é identificada e a pesquisa de preços começa automaticamente.
                </p>
              </div>
            </div>

            {/* Visibly Disabled AI Image Generation Option as requested */}
            <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  <ImageOff className="h-3.5 w-3.5" />
                  Criar Foto com IA
                </span>
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Desativado
                </span>
              </div>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="mt-2 w-full cursor-not-allowed rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
              >
                Gerar Foto com IA (Desativado no momento)
              </button>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Recurso mantido visível e desativado por padrão (requer chave de API paga).
              </p>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-7">
            <div>
              <label
                htmlFor="ai-query-input"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                2. Nome, marca ou modelo (opcional quando uma foto for enviada)
              </label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input
                  id="ai-query-input"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex: Fone JBL Tune 720BT, Cafeteira Nespresso..."
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
                <button
                  id="ai-research-button"
                  type="button"
                  disabled={!canUseAI || researching}
                  onClick={() => {
                    const imageSourceUrl = imageUrlInput.trim();
                    if (imageSourceUrl) {
                      lastAutoResearchedImageUrl.current = imageSourceUrl;
                      setImageUrl(imageSourceUrl);
                      void handleResearchAI({ imageUrl: imageSourceUrl });
                    } else {
                      void handleResearchAI();
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5" />
                  {researching ? 'Identificando e pesquisando...' : 'Pesquisar na web'}
                </button>
              </div>
            </div>

            {/* Market Price Stats */}
            {(minMarketPrice || avgMarketPrice || maxMarketPrice) && (
              <div className="grid grid-cols-3 gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Mais barato (web)</p>
                  <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white">
                    {formatBRL(Number(minMarketPrice) || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Média de Mercado</p>
                  <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400">
                    {formatBRL(Number(avgMarketPrice) || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Mais caro (web)</p>
                  <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white">
                    {formatBRL(Number(maxMarketPrice) || 0)}
                  </p>
                </div>
              </div>
            )}

            {/* Product Form */}
            <form onSubmit={handleSaveProduct} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="prod-name" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Nome do Produto
                  </label>
                  <input
                    id="prod-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome gerado pela IA ou manual"
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="prod-cat" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Categoria (automática)
                  </label>
                  <input
                    id="prod-cat"
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Ex: Áudio, Casa & Cozinha"
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div>
                  <label htmlFor="prod-price" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Preço na Loja (R$)
                  </label>
                  <input
                    id="prod-price"
                    type="number"
                    step="0.01"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="299.00"
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="prod-min" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Mín. web
                  </label>
                  <input
                    id="prod-min"
                    type="number"
                    step="0.01"
                    value={minMarketPrice}
                    onChange={(e) => setMinMarketPrice(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="prod-avg" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Média web
                  </label>
                  <input
                    id="prod-avg"
                    type="number"
                    step="0.01"
                    value={avgMarketPrice}
                    onChange={(e) => setAvgMarketPrice(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="prod-max" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Máx. web
                  </label>
                  <input
                    id="prod-max"
                    type="number"
                    step="0.01"
                    value={maxMarketPrice}
                    onChange={(e) => setMaxMarketPrice(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="prod-stock" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Estoque
                  </label>
                  <input
                    id="prod-stock"
                    type="number"
                    min={0}
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="prod-tags" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Tags (automáticas, separadas por vírgula)
                </label>
                <input
                  id="prod-tags"
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="bluetooth, oferta, home-office"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
              </div>

              <div>
                <label htmlFor="prod-desc" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Descrição Automática
                </label>
                <textarea
                  id="prod-desc"
                  rows={5}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição comercial gerada automaticamente..."
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
              </div>

              {sources.length > 0 && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold">Fontes da pesquisa:</span>{' '}
                  {sources.map((s, i) => (
                    <a
                      key={`${s.uri}-${i}`}
                      href={s.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="mr-3 inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {s.title}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              )}

              {editingProductId && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      clearProductForm();
                      setError('');
                      setSuccessMsg('Edição cancelada.');
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <X className="h-4 w-4" />
                    Cancelar edição
                  </button>
                </div>
              )}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!(editingProductId ? canEdit : canCreate) || saving}
                  className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 cursor-pointer"
                >
                  {saving
                    ? 'Salvando na Vitrine...'
                    : editingProductId
                      ? 'Salvar Alterações'
                      : 'Publicar Produto na Vitrine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Existing Products Table */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
            Produtos Cadastrados ({products.length})
          </h3>
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Ordenar por
            <select
              value={sortOption}
              onChange={(event) => handleSortOptionChange(event.target.value as ProductSortOption)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            >
              <option value="recent">Postados recentemente</option>
              <option value="clicks">Mais cliques</option>
              <option value="price">Maior preço</option>
              <option value="name">Nome (A–Z)</option>
              {sortOption === 'custom' && <option value="custom">Ordenação pela coluna</option>}
            </select>
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th aria-sort={sortBy === 'name' ? sortDirection === 'desc' ? 'descending' : 'ascending' : 'none'} className="py-3 pr-4">
                  {renderSortHeader('Produto', 'name')}
                </th>
                <th aria-sort={sortBy === 'category' ? sortDirection === 'desc' ? 'descending' : 'ascending' : 'none'} className="py-3 pr-4">
                  {renderSortHeader('Categoria', 'category')}
                </th>
                <th aria-sort={sortBy === 'price' ? sortDirection === 'desc' ? 'descending' : 'ascending' : 'none'} className="py-3 pr-4 text-right">
                  {renderSortHeader('Preço', 'price', true)}
                </th>
                <th aria-sort={sortBy === 'avgMarketPrice' ? sortDirection === 'desc' ? 'descending' : 'ascending' : 'none'} className="py-3 pr-4 text-right">
                  {renderSortHeader('Média web', 'avgMarketPrice', true)}
                </th>
                <th aria-sort={sortBy === 'clicksFromSocial' ? sortDirection === 'desc' ? 'descending' : 'ascending' : 'none'} className="py-3 pr-4 text-right">
                  {renderSortHeader('Cliques Social', 'clicksFromSocial', true)}
                </th>
                <th className="py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {sortedProducts.map((p) => {
                const link = buildTrackedBuyLink(window.location.origin, p.id, 'fb_direto');
                return (
                  <tr key={p.id}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="h-10 w-12 rounded-md object-cover bg-zinc-100 dark:bg-zinc-800"
                        />
                        <div>
                          <p className="font-medium text-zinc-900 dark:text-white">{p.name}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {p.tags.slice(0, 3).map((t) => `#${t}`).join(' ')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-300">{p.category}</td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums text-zinc-900 dark:text-white">
                      {formatBRL(p.price)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                      {formatBRL(p.avgMarketPrice)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                      {p.clicksFromSocial}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleEditProduct(p)}
                            aria-label={`Editar ${p.name}`}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <Pencil className="h-3 w-3" />
                            Editar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(link);
                            setCopiedId(p.id);
                            setTimeout(() => setCopiedId(''), 1800);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                        >
                          {copiedId === p.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedId === p.id ? 'Copiado' : 'Link'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSendToFacebook(p, suggestedFbCaption || undefined)}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                        >
                          <Send className="h-3 w-3" />
                          Postar no FB
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(p.id)}
                            aria-label={`Excluir ${p.name}`}
                            className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
