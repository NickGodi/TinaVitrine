import { useState } from 'react';
import { Check, Shield } from 'lucide-react';
import { api } from '../../api';
import type { PermissionKey, Role, RolePermissionsMap } from '../../types';

interface PermissionsPanelProps {
  roleMatrix: RolePermissionsMap;
  onMatrixUpdated: (next: RolePermissionsMap) => void;
  onTestRole: (role: Role) => Promise<void>;
}

const PERMISSION_LABELS: Array<{ key: PermissionKey; label: string; desc: string }> = [
  { key: 'view_store', label: 'Ver Vitrine', desc: 'Acessar o catálogo de produtos na loja.' },
  { key: 'buy_products', label: 'Comprar Produtos', desc: 'Adicionar à sacola e finalizar checkout.' },
  { key: 'create_products', label: 'Criar Produtos', desc: 'Cadastrar novos produtos no painel.' },
  { key: 'edit_products', label: 'Editar Produtos', desc: 'Alterar preço, descrição e estoque.' },
  { key: 'delete_products', label: 'Excluir Produtos', desc: 'Remover produtos publicados.' },
  { key: 'ai_research', label: 'Pesquisa de produtos na web', desc: 'Pesquisar produto por nome ou página e consultar preços com a Tavily.' },
  { key: 'social_autopost', label: 'Postagem Automática Facebook', desc: 'Conectar Facebook e agendar/publicar posts.' },
  { key: 'manage_gateways', label: 'Gerenciar Gateways', desc: 'Configurar PIX, Mercado Pago, Stripe e taxas.' },
  { key: 'view_orders', label: 'Visualizar Vendas', desc: 'Ver todos os pedidos processados.' },
  { key: 'view_analytics', label: 'Ver Métricas', desc: 'Acompanhar cliques sociais e receita.' },
];

export function PermissionsPanel({
  roleMatrix,
  onMatrixUpdated,
  onTestRole,
}: PermissionsPanelProps) {
  const [draft, setDraft] = useState<RolePermissionsMap>(structuredClone(roleMatrix));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function toggle(role: 'admin' | 'user' | 'guest', key: PermissionKey) {
    setDraft((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [key]: !prev[role][key],
      },
    }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await api.updatePermissions(draft);
      onMatrixUpdated(res.roleMatrix);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar permissões.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Gerenciamento de Permissões por Cargo
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Defina o que Administradores, Usuários Logados e Visitantes Não Logados podem fazer. O Criador sempre possui acesso total.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {saved ? <Check className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
            {saving ? 'Salvando...' : saved ? 'Permissões Salvas' : 'Salvar Permissões'}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="py-3 pr-4 font-medium">Permissão</th>
                <th className="px-4 py-3 text-center font-medium">Criador</th>
                <th className="px-4 py-3 text-center font-medium">Administrador</th>
                <th className="px-4 py-3 text-center font-medium">Usuário Logado</th>
                <th className="px-4 py-3 text-center font-medium">Não Logado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {PERMISSION_LABELS.map((item) => (
                <tr key={item.key}>
                  <td className="py-3.5 pr-4">
                    <p className="font-medium text-zinc-900 dark:text-white">{item.label}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.desc}</p>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <input type="checkbox" checked readOnly disabled aria-label={`${item.label} Criador`} />
                  </td>
                  {(['admin', 'user', 'guest'] as const).map((role) => (
                    <td key={role} className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(draft[role]?.[item.key])}
                        onChange={() => toggle(role, item.key)}
                        aria-label={`${item.label} para ${role}`}
                        className="h-4 w-4 cursor-pointer accent-blue-600"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Role Testing Box */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
          Alternar Cargo para Testes Rápidos
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Simule instantaneamente a visão de outro cargo e volte para Criador a qualquer momento usando a barra superior.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onTestRole('admin')}
            className="rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Testar como Administrador
          </button>
          <button
            type="button"
            onClick={() => onTestRole('user')}
            className="rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Testar como Usuário Logado
          </button>
          <button
            type="button"
            onClick={() => onTestRole('guest')}
            className="rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Testar como Não Logado
          </button>
        </div>
      </div>
    </div>
  );
}
