import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Clock3, Copy, CreditCard, Trash2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';
import type { Order, PaymentGateway, Product, PublicUser } from '../types';
import { formatBRL } from '../utils/commerce';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartCheckoutDrawerProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQty: (productId: string, qty: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  gateways: PaymentGateway[];
  currentUser: PublicUser | null;
  sourceRef: string;
  onOrderCompleted: (order: Order) => void;
}

export function CartCheckoutDrawer({
  open,
  onClose,
  items,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  gateways,
  currentUser,
  sourceRef,
  onOrderCompleted,
}: CartCheckoutDrawerProps) {
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>(gateways[0]?.id || 'gw_pix');
  const [customerName, setCustomerName] = useState(currentUser?.displayName || '');
  const [customerPhone, setCustomerPhone] = useState(currentUser?.phone || '');
  const [shippingAddress, setShippingAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setCustomerName(currentUser.displayName || '');
      setCustomerPhone(currentUser.phone || '');
    }
  }, [currentUser?.id, open]);

  if (!open) return null;

  const subtotal = items.reduce((sum, it) => sum + it.product.price * it.quantity, 0);
  const activeGateways = gateways.filter((g) => g.enabled);
  const effectiveGwId =
    activeGateways.find((g) => g.id === selectedGatewayId)?.id || activeGateways[0]?.id || '';
  const confirmedOrderIsPaid = confirmedOrder?.paymentStatus === 'paid';
  const confirmedOrderStatusText = confirmedOrder?.paymentStatus === 'pending_pix'
    ? 'Aguardando pagamento via Pix'
    : confirmedOrder?.paymentStatus === 'processing'
      ? 'Aguardando confirmação do pagamento'
      : confirmedOrder?.paymentStatus === 'cancelled'
        ? 'Pagamento cancelado'
        : 'Pagamento aprovado';

  async function handleCheckout(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!effectiveGwId) {
      setError('Nenhum gateway de pagamento ativo no momento.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createOrder({
        items: items.map((it) => ({ productId: it.product.id, quantity: it.quantity })),
        gatewayId: effectiveGwId,
        customerName: customerName || currentUser?.displayName || '',
        customerPhone: customerPhone || currentUser?.phone || '',
        shippingAddress,
        sourceRef,
      });
      if (res.checkoutUrl) {
        window.location.assign(res.checkoutUrl);
        return;
      }
      setConfirmedOrder(res.order);
      onClearCart();
      onOrderCompleted(res.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar pagamento.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setConfirmedOrder(null);
          onClose();
        }
      }}
    >
      <div className="flex h-full w-full max-w-lg flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 id="cart-drawer-title" className="text-lg font-semibold text-zinc-900 dark:text-white">
            {confirmedOrder ? 'Pedido Criado' : 'Sacola e Checkout'}
          </h2>
          <button
            type="button"
            onClick={() => {
              setConfirmedOrder(null);
              onClose();
            }}
            aria-label="Fechar sacola"
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {confirmedOrder ? (
            <div className="space-y-5">
              <div className={`rounded-xl border p-5 ${confirmedOrderIsPaid ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30'}`}>
                <div className="flex items-center gap-3">
                  {confirmedOrderIsPaid
                    ? <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    : <Clock3 className="h-6 w-6 text-amber-600 dark:text-amber-400" />}
                  <div>
                    <p className="font-mono text-sm font-bold text-zinc-900 dark:text-white">
                      {confirmedOrder.id} — {confirmedOrderStatusText}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300">
                      Gateway: {confirmedOrder.gatewayName}
                    </p>
                  </div>
                </div>
              </div>

              {confirmedOrder.pixCopyPaste && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-4 flex flex-col items-center rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700">
                    <p className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-900">
                      Escaneie com o aplicativo do seu banco
                    </p>
                    <QRCodeSVG
                      value={confirmedOrder.pixCopyPaste}
                      size={208}
                      level="M"
                      includeMargin
                      title="QR Code para pagamento Pix"
                      className="h-auto max-w-full"
                    />
                  </div>
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Código PIX Copia e Cola
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Pague o total do pedido no aplicativo do seu banco. A confirmação do Pix não é automática.
                  </p>
                  <p className="mt-2 break-all rounded-md border border-zinc-200 bg-white p-2.5 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                    {confirmedOrder.pixCopyPaste}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(confirmedOrder.pixCopyPaste || '');
                      setCopiedPix(true);
                      setTimeout(() => setCopiedPix(false), 2000);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedPix ? 'Código PIX Copiado' : 'Copiar Código PIX'}
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Resumo do Recibo
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  {confirmedOrder.items.map((it) => (
                    <div key={it.productId} className="flex justify-between">
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {it.quantity}x {it.productName}
                      </span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-white">
                        {formatBRL(it.unitPrice * it.quantity)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-zinc-200 pt-2 font-semibold dark:border-zinc-800">
                    <span className="text-zinc-900 dark:text-white">
                      {confirmedOrderIsPaid ? 'Total pago' : 'Total do pedido'}
                    </span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-white">
                      {formatBRL(confirmedOrder.total)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setConfirmedOrder(null);
                  onClose();
                }}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 cursor-pointer"
              >
                Continuar Comprando
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-base font-semibold text-zinc-900 dark:text-white">
                Sua sacola está vazia.
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Adicione produtos da vitrine para finalizar sua compra.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {items.map((item) => (
                  <li key={item.product.id} className="flex gap-4 py-4 first:pt-0">
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      referrerPolicy="no-referrer"
                      className="h-16 w-20 shrink-0 rounded-lg object-cover bg-zinc-100 dark:bg-zinc-800"
                    />
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                          {item.product.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.product.id)}
                          aria-label={`Remover ${item.product.name}`}
                          className="text-zinc-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center rounded-md border border-zinc-200 dark:border-zinc-700">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                            className="px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                          >
                            −
                          </button>
                          <span className="px-2 font-mono text-xs tabular-nums text-zinc-900 dark:text-white">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
                            className="px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">
                          {formatBRL(item.product.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <form onSubmit={handleCheckout} className="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Dados de Entrega &amp; Gateway de Pagamento
                </h3>

                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                  >
                    {error}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label htmlFor="chk-name" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Nome completo
                    </label>
                    <input
                      id="chk-name"
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Seu nome completo"
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="chk-phone" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      WhatsApp
                    </label>
                    <input
                      id="chk-phone"
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="chk-addr" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Endereço completo
                    </label>
                    <input
                      id="chk-addr"
                      type="text"
                      required
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="Rua, número, bairro, cidade - UF"
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Escolha o Gateway de Pagamento Automático
                  </p>
                  <div className="mt-2 space-y-2">
                    {activeGateways.map((gw) => (
                      <label
                        key={gw.id}
                        className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm transition-colors ${
                          effectiveGwId === gw.id
                            ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30'
                            : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="gateway"
                            checked={effectiveGwId === gw.id}
                            onChange={() => setSelectedGatewayId(gw.id)}
                          />
                          <CreditCard className="h-4 w-4 text-zinc-500" />
                          <span className="font-medium text-zinc-900 dark:text-white">
                            {gw.name}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {gw.settlementTime}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Total do Pedido
                  </span>
                  <span className="font-mono text-xl font-bold tabular-nums text-zinc-950 dark:text-white">
                    {formatBRL(subtotal)}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? 'Processando pagamento...' : 'Finalizar e Pagar Agora'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
