import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Ban, KeyRound, LogIn, Trash2, UserCheck } from 'lucide-react';
import { api } from '../api';
import type { Order, PublicUser } from '../types';
import { formatBRL } from '../utils/commerce';

interface ProfileViewProps {
  userId: string;
  isCreatorViewing: boolean;
  canChangeCredentials: boolean;
  onBack?: () => void;
  onImpersonate: (userId: string) => Promise<void>;
  onUserUpdated: () => void;
}

const ROLE_TEXT = {
  creator: 'Criador',
  admin: 'Administrador',
  user: 'Usuário Logado',
  guest: 'Não Logado',
};

export function ProfileView({
  userId,
  isCreatorViewing,
  canChangeCredentials,
  onBack,
  onImpersonate,
  onUserUpdated,
}: ProfileViewProps) {
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [credentialsError, setCredentialsError] = useState('');
  const [credentialsMessage, setCredentialsMessage] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setConfirmDelete(false);
    api
      .getUserProfile(userId)
      .then((res) => {
        if (!active) return;
        setProfile(res.profile);
        setLoginUsername(res.profile.username);
        setOrders(res.orders);
        setCanManage(res.canManage);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar perfil.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  async function handleToggleBan() {
    if (!profile) return;
    try {
      const res = await api.toggleBanUser(profile.id, !profile.banned);
      setProfile(res.user);
      onUserUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status.');
    }
  }

  async function handleDelete() {
    if (!profile) return;
    try {
      await api.deleteUser(profile.id);
      onUserUpdated();
      onBack?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir usuário.');
    }
  }

  async function handleCredentialsSubmit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;

    setCredentialsError('');
    setCredentialsMessage('');

    if (newPassword !== confirmNewPassword) {
      setCredentialsError('As senhas novas não coincidem.');
      return;
    }

    if (loginUsername.trim() === profile.username && !newPassword) {
      setCredentialsError('Informe um novo usuário ou uma nova senha.');
      return;
    }

    setSavingCredentials(true);
    try {
      const result = await api.updateCredentials({
        currentPassword,
        newUsername: loginUsername.trim(),
        newPassword: newPassword || undefined,
      });
      setProfile(result.user);
      setLoginUsername(result.user.username);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setCredentialsMessage('Dados de acesso atualizados.');
      onUserUpdated();
    } catch (err) {
      setCredentialsError(
        err instanceof Error ? err.message : 'Não foi possível atualizar os dados de acesso.'
      );
    } finally {
      setSavingCredentials(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="h-48 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-semibold">{error || 'Perfil indisponível.'}</p>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold underline cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-xl font-bold text-white dark:bg-white dark:text-zinc-900">
              {profile.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                {profile.displayName}
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                <span>@{profile.username}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>{ROLE_TEXT[profile.role]}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span className={profile.banned ? 'text-red-600 font-semibold' : 'text-emerald-700 dark:text-emerald-400 font-medium'}>
                  {profile.banned ? 'Conta Banida' : 'Conta Ativa'}
                </span>
              </p>
              <p className="mt-3 max-w-2xl text-sm text-zinc-700 dark:text-zinc-300">
                {profile.bio || 'Sem biografia informada.'}
              </p>
            </div>
          </div>

          {isCreatorViewing && canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onImpersonate(profile.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5" />
                Entrar na Conta
              </button>
              <button
                type="button"
                onClick={handleToggleBan}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                  profile.banned
                    ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                    : 'border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30'
                }`}
              >
                {profile.banned ? (
                  <>
                    <UserCheck className="h-3.5 w-3.5" />
                    Desbanir
                  </>
                ) : (
                  <>
                    <Ban className="h-3.5 w-3.5" />
                    Banir
                  </>
                )}
              </button>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30 whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 whitespace-nowrap cursor-pointer"
                >
                  Confirmar Exclusão
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-zinc-200 pt-6 sm:grid-cols-3 dark:border-zinc-800">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Cidade</p>
            <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-white">{profile.city || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Cadastro em</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-zinc-900 dark:text-white">
              {new Date(profile.createdAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Telefone</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-zinc-900 dark:text-white">
              {profile.phone || '—'}
            </p>
          </div>
        </div>
      </div>

      {canChangeCredentials && (
        <form
          onSubmit={handleCredentialsSubmit}
          className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Alterar dados de acesso
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Troque o usuário usado para entrar e, se quiser, atualize sua senha.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="account-login-username" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Usuário para entrar
              </label>
              <input
                id="account-login-username"
                type="text"
                minLength={3}
                required
                autoComplete="username"
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="account-current-password" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Senha atual
              </label>
              <input
                id="account-current-password"
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="account-new-password" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Nova senha <span className="font-normal text-zinc-500">(opcional)</span>
              </label>
              <input
                id="account-new-password"
                type="password"
                minLength={6}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="account-confirm-password" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Confirmar nova senha
              </label>
              <input
                id="account-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            </div>
          </div>

          {(credentialsError || credentialsMessage) && (
            <p
              role={credentialsError ? 'alert' : 'status'}
              className={credentialsError ? 'mt-4 text-sm text-red-600 dark:text-red-400' : 'mt-4 text-sm text-emerald-700 dark:text-emerald-400'}
            >
              {credentialsError || credentialsMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={savingCredentials}
            className="mt-5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
          >
            {savingCredentials ? 'Salvando...' : 'Salvar dados de acesso'}
          </button>
        </form>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
          Histórico de Compras ({orders.length})
        </h2>
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Nenhum pedido registrado nesta conta ainda.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Gateway</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3 font-mono font-medium text-zinc-900 dark:text-white">
                      {order.id}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                      {new Date(order.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {order.gatewayName}
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium ${order.paymentStatus === 'paid' ? 'text-emerald-700 dark:text-emerald-400' : order.paymentStatus === 'cancelled' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      {order.paymentStatus === 'paid'
                        ? 'Pago'
                        : order.paymentStatus === 'pending_pix'
                          ? 'Aguardando Pix'
                          : order.paymentStatus === 'cancelled'
                            ? 'Cancelado'
                            : 'Aguardando confirmação'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-zinc-900 dark:text-white">
                      {formatBRL(order.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
