import { Moon, ShoppingBag, Sun } from 'lucide-react';
import type { Role, SessionState } from '../types';

interface HeaderProps {
  activeView: 'store' | 'admin' | 'profile';
  onNavigate: (view: 'store' | 'admin' | 'profile') => void;
  onScrollToCatalog: () => void;
  session: SessionState;
  cartCount: number;
  onOpenCart: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onTestRole: (role: Role) => void;
  onStopImpersonate: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

const ROLE_LABELS: Record<Role, string> = {
  creator: 'Criador',
  admin: 'Administrador',
  user: 'Usuário Logado',
  guest: 'Não Logado',
};

export function Header({
  activeView,
  onNavigate,
  onScrollToCatalog,
  session,
  cartCount,
  onOpenCart,
  onOpenAuth,
  onLogout,
  onTestRole,
  onStopImpersonate,
  darkMode,
  onToggleDarkMode,
}: HeaderProps) {
  const canAccessPanel =
    session.permissions.create_products ||
    session.permissions.ai_research ||
    session.permissions.social_autopost ||
    session.permissions.manage_gateways ||
    session.effectiveRole === 'creator';

  const isCreatorReal = session.realUser?.role === 'creator';

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('store')}
            className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            TinaVitrine
          </button>

          {/* Zone 2: 4-5 clean single-line text navigation links */}
          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-300"
          >
            <button
              type="button"
              onClick={() => {
                onNavigate('store');
                setTimeout(onScrollToCatalog, 50);
              }}
              className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeView === 'store'
                  ? 'text-zinc-950 dark:text-white underline underline-offset-8 decoration-2'
                  : 'hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              Catálogo
            </button>
            {canAccessPanel && (
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeView === 'admin'
                    ? 'text-zinc-950 dark:text-white underline underline-offset-8 decoration-2'
                    : 'hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Painel
              </button>
            )}
            {session.effectiveUser && (
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeView === 'profile'
                    ? 'text-zinc-950 dark:text-white underline underline-offset-8 decoration-2'
                    : 'hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                Minha Conta
              </button>
            )}
            <button
              type="button"
              onClick={onOpenCart}
              className="whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors hover:text-zinc-950 dark:hover:text-white cursor-pointer"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              <span>Sacola</span>
              <span className="font-mono tabular-nums text-xs">({cartCount})</span>
            </button>
          </nav>

          {/* Zone 3: 1 compact theme toggle + 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenCart}
              aria-label={`Abrir sacola com ${cartCount} itens`}
              className="md:hidden inline-flex items-center justify-center rounded-lg border border-zinc-200 p-2 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900 cursor-pointer"
            >
              <ShoppingBag className="h-4 w-4" />
              <span className="ml-1 font-mono text-xs tabular-nums">{cartCount}</span>
            </button>

            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
              title={darkMode ? 'Modo Claro' : 'Modo Escuro'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900 cursor-pointer"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {session.realUser ? (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sair
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Workspace Bar strictly for Creator Role-Testing & Impersonation */}
      {isCreatorReal && (
        <div
          data-testid="creator-workspace-bar"
          className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs sm:px-6">
            <div className="flex flex-wrap items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <span className="font-semibold text-zinc-900 dark:text-white">
                {session.isImpersonating
                  ? `Conectado na conta de ${session.effectiveUser?.displayName} (@${session.effectiveUser?.username})`
                  : session.testingRole
                    ? `Modo de Teste de Cargo: ${ROLE_LABELS[session.testingRole]}`
                    : `Sessão Criador: ${session.realUser?.displayName}`}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                Cargo ativo: {ROLE_LABELS[session.effectiveRole]}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="role-test-select" className="text-zinc-600 dark:text-zinc-400">
                Testar cargo:
              </label>
              <select
                id="role-test-select"
                value={session.testingRole || (session.isImpersonating ? session.effectiveRole : 'creator')}
                onChange={(e) => onTestRole(e.target.value as Role)}
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="creator">Criador (Padrão)</option>
                <option value="admin">Administrador</option>
                <option value="user">Usuário Logado</option>
                <option value="guest">Não Logado (Visitante)</option>
              </select>

              {(session.isImpersonating || session.testingRole) && (
                <button
                  type="button"
                  onClick={onStopImpersonate}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Voltar para Criador
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
