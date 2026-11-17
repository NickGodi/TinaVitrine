import { useEffect, useState } from 'react';
import { Ban, Eye, LogIn, Trash2, UserCheck } from 'lucide-react';
import { api } from '../../api';
import type { PublicUser } from '../../types';
import { formatBRL } from '../../utils/commerce';

interface UsersManagementPanelProps {
  onViewProfile: (userId: string) => void;
  onImpersonate: (userId: string) => Promise<void>;
}

const ROLE_LABELS = {
  creator: 'Criador',
  admin: 'Administrador',
  user: 'Usuário Logado',
  guest: 'Não Logado',
};

export function UsersManagementPanel({
  onViewProfile,
  onImpersonate,
}: UsersManagementPanelProps) {
  const [users, setUsers] = useState<
    Array<PublicUser & { ordersCount: number; totalSpent: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const res = await api.getUsers();
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao listar usuários.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleToggleBan(u: PublicUser) {
    try {
      await api.toggleBanUser(u.id, !u.banned);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar banimento.');
    }
  }

  async function handleDelete(userId: string) {
    try {
      await api.deleteUser(userId);
      setConfirmDeleteId(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir usuário.');
    }
  }

  if (loading) {
    return (
      <div className="h-48 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900" />
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex justify-end">
        <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {users.length} contas registradas
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="py-3 pr-4 font-medium">Usuário</th>
              <th className="py-3 pr-4 font-medium">Cargo</th>
              <th className="py-3 pr-4 font-medium">Data de Criação</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 pr-4 text-right font-medium">Compras</th>
              <th className="py-3 text-right font-medium">Ações do Criador</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-3.5 pr-4">
                  <p className="font-semibold text-zinc-900 dark:text-white">{u.displayName}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    @{u.username}
                  </p>
                </td>
                <td className="py-3.5 pr-4 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {ROLE_LABELS[u.role]}
                </td>
                <td className="py-3.5 pr-4 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                  {new Date(u.createdAt).toLocaleString('pt-BR')}
                </td>
                <td className="py-3.5 pr-4 text-xs font-semibold">
                  <span
                    className={
                      u.banned
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }
                  >
                    {u.banned ? 'Banido' : 'Ativo'}
                  </span>
                </td>
                <td className="py-3.5 pr-4 text-right font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
                  {u.ordersCount} ({formatBRL(u.totalSpent)})
                </td>
                <td className="py-3.5 text-right">
                  <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onViewProfile(u.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Ver Perfil
                    </button>

                    {u.role !== 'creator' && (
                      <>
                        <button
                          type="button"
                          onClick={() => onImpersonate(u.id)}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                        >
                          <LogIn className="h-3.5 w-3.5" />
                          Entrar na Conta
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleBan(u)}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30 cursor-pointer"
                        >
                          {u.banned ? (
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

                        {confirmDeleteId === u.id ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(u.id)}
                            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
                          >
                            Confirmar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(u.id)}
                            aria-label={`Excluir ${u.username}`}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
