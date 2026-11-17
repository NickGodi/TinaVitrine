import { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2 } from 'lucide-react';
import { api } from '../../api';
import type { Order, PaymentGateway } from '../../types';
import { formatBRL } from '../../utils/commerce';

interface GatewaysOrdersPanelProps {
  showGatewayConfig: boolean;
  canManageGateways: boolean;
  canViewOrders: boolean;
}

export function GatewaysOrdersPanel({
  showGatewayConfig,
  canManageGateways,
  canViewOrders,
}: GatewaysOrdersPanelProps) {
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [confirmingOrderId, setConfirmingOrderId] = useState('');

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [gwRes, ordRes] = await Promise.all([
        showGatewayConfig ? api.getGateways() : Promise.resolve({ gateways: [] }),
        canViewOrders ? api.getOrders() : Promise.resolve({ orders: [] }),
      ]);
      setGateways(gwRes.gateways);
      setOrders(ordRes.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar gateways e vendas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [showGatewayConfig, canManageGateways, canViewOrders]);

  async function handleToggleGateway(gw: PaymentGateway) {
    try {
      await api.updateGateway(gw.id, { enabled: !gw.enabled });
      setSavedNotice(`Gateway ${gw.name} atualizado.`);
      setTimeout(() => setSavedNotice(''), 2000);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar gateway.');
    }
  }

  async function handleChangeMode(gw: PaymentGateway, mode: 'sandbox' | 'production') {
    try {
      await api.updateGateway(gw.id, { mode });
      setSavedNotice(`Modo de ${gw.name} alterado para ${mode}.`);
      setTimeout(() => setSavedNotice(''), 2000);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar modo.');
    }
  }

  async function handleConfirmPix(orderId: string) {
    setError('');
    setConfirmingOrderId(orderId);
    try {
      await api.confirmPixOrder(orderId);
      setSavedNotice(`Pagamento Pix do pedido ${orderId} confirmado.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar pagamento Pix.');
    } finally {
      setConfirmingOrderId('');
    }
  }

  if (loading) {
    return (
      <div className="h-48 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900" />
    );
  }

  const totalRevenue = orders
    .filter((order) => order.paymentStatus === 'paid')
    .reduce((sum, order) => sum + order.total, 0);

  return (
    <div className="space-y-8">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </div>
      )}
      {savedNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {savedNotice}
        </div>
      )}

      {/* Payment Gateways Configuration */}
      {showGatewayConfig && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Gateways de Pagamento Integrados
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Checkout por Pix e Stripe. Outros meios aparecem quando tiverem integração configurada.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {gateways.map((gw) => (
              <div
                key={gw.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                        {gw.name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Liquidação: {gw.settlementTime} · Taxa:{' '}
                        <span className="font-mono tabular-nums">{gw.feePercent}%</span>
                      </p>
                      {gw.provider === 'stripe' && (
                        <p className={`mt-1 text-xs ${gw.configured && gw.webhookConfigured ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                          {gw.configured
                            ? gw.webhookConfigured
                              ? 'Stripe conectado · webhook configurado'
                              : 'Stripe conectado · falta o segredo do webhook para confirmação automática'
                            : 'Adicione STRIPE_SECRET_KEY ao .env do servidor para conectar'}
                        </p>
                      )}
                      {gw.provider === 'pix' && (
                        <p className={`mt-1 text-xs ${gw.configured ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                          {gw.configured ? 'Código Pix Copia e Cola cadastrado' : 'Cadastre o código Pix Copia e Cola'}
                        </p>
                      )}
                      {(gw.provider === 'mercadopago' || gw.provider === 'pagbank') && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          Integração e credenciais ausentes; gateway desativado
                        </p>
                      )}
                    </div>
                  </div>

                  {canManageGateways && (
                    <button
                      type="button"
                      onClick={() => handleToggleGateway(gw)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                        gw.enabled
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                      disabled={!gw.configured}
                      title={!gw.configured ? 'Configure e valide este gateway antes de ativá-lo.' : undefined}
                    >
                      {gw.enabled ? 'Ativo' : 'Desativado'}
                    </button>
                  )}
                </div>

                {canManageGateways && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
                    <span className="font-mono text-zinc-500 dark:text-zinc-400">
                      Webhook: {gw.webhookUrl}
                    </span>
                    <select
                      aria-label={`Modo do gateway ${gw.name}`}
                      value={gw.mode}
                      onChange={(e) =>
                        handleChangeMode(gw, e.target.value as 'sandbox' | 'production')
                      }
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                    >
                      <option value="production">Produção</option>
                      <option value="sandbox">Sandbox</option>
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      )}

      {/* Processed Orders Ledger */}
      {canViewOrders && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                Pedidos Registrados ({orders.length})
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Receita acumulada:{' '}
                <span className="font-mono font-bold tabular-nums text-zinc-900 dark:text-white">
                  {formatBRL(totalRevenue)}
                </span>
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="py-3 pr-4 font-medium">Pedido</th>
                  <th className="py-3 pr-4 font-medium">Cliente</th>
                  <th className="py-3 pr-4 font-medium">Gateway</th>
                  <th className="py-3 pr-4 font-medium">Origem</th>
                  <th className="py-3 pr-4 font-medium">Data</th>
                  <th className="py-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {orders.map((ord) => (
                  <tr key={ord.id}>
                    <td className="py-3 pr-4 font-mono font-semibold text-zinc-900 dark:text-white">
                      {ord.id}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-zinc-900 dark:text-white">{ord.customerName}</p>
                      <p className="text-xs text-zinc-500">
                        {ord.customerPhone || 'Sem telefone informado'}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-xs text-zinc-700 dark:text-zinc-300">
                      <p>{ord.gatewayName}</p>
                      <p className={ord.paymentStatus === 'paid' ? 'mt-1 text-emerald-700 dark:text-emerald-400' : ord.paymentStatus === 'cancelled' ? 'mt-1 text-red-700 dark:text-red-400' : 'mt-1 text-amber-700 dark:text-amber-400'}>
                        {ord.paymentStatus === 'paid'
                          ? 'Pago'
                          : ord.paymentStatus === 'pending_pix'
                            ? 'Aguardando Pix'
                            : ord.paymentStatus === 'cancelled'
                              ? 'Cancelado'
                              : 'Aguardando confirmação'}
                      </p>
                      {canManageGateways && ord.paymentStatus === 'pending_pix' && (
                        <button
                          type="button"
                          onClick={() => handleConfirmPix(ord.id)}
                          disabled={confirmingOrderId === ord.id}
                          className="mt-2 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {confirmingOrderId === ord.id ? 'Confirmando...' : 'Confirmar Pix recebido'}
                        </button>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-zinc-500">
                      {ord.sourceRef || 'direct'}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs tabular-nums text-zinc-500">
                      {new Date(ord.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 text-right font-mono font-semibold tabular-nums text-zinc-900 dark:text-white">
                      {formatBRL(ord.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
