import { useState } from 'react';
import { CreditCard, Layers, Share2, Shield, Users } from 'lucide-react';
import type { Product, Role, RolePermissionsMap, SessionState } from '../types';
import { AIProductStudio } from './admin/AIProductStudio';
import { GatewaysOrdersPanel } from './admin/GatewaysOrdersPanel';
import { PermissionsPanel } from './admin/PermissionsPanel';
import { SocialAutomationPanel } from './admin/SocialAutomationPanel';
import { UsersManagementPanel } from './admin/UsersManagementPanel';

type AdminTab = 'catalog' | 'social' | 'users' | 'permissions' | 'gateways';

interface AdminDashboardProps {
  session: SessionState;
  products: Product[];
  initialEditProductId: string | null;
  onInitialEditHandled: () => void;
  onProductsChanged: () => Promise<void>;
  onViewProfile: (userId: string) => void;
  onImpersonate: (userId: string) => Promise<void>;
  onMatrixUpdated: (matrix: RolePermissionsMap) => void;
  onTestRole: (role: Role) => Promise<void>;
}

export function AdminDashboard({
  session,
  products,
  initialEditProductId,
  onInitialEditHandled,
  onProductsChanged,
  onViewProfile,
  onImpersonate,
  onMatrixUpdated,
  onTestRole,
}: AdminDashboardProps) {
  const isCreatorEffective = session.effectiveRole === 'creator';
  const [activeTab, setActiveTab] = useState<AdminTab>('catalog');
  const [preselectedProductId, setPreselectedProductId] = useState<string | undefined>();
  const [preselectedCaption, setPreselectedCaption] = useState<string | undefined>();

  const tabs: Array<{ id: AdminTab; label: string; icon: typeof Layers; visible: boolean }> = [
    {
      id: 'catalog',
      label: 'Produtos',
      icon: Layers,
      visible:
        session.permissions.create_products ||
        session.permissions.edit_products ||
        session.permissions.ai_research ||
        isCreatorEffective,
    },
    {
      id: 'social',
      label: 'Facebook Automático',
      icon: Share2,
      visible: session.permissions.social_autopost || isCreatorEffective,
    },
    {
      id: 'users',
      label: 'Usuários',
      icon: Users,
      visible: isCreatorEffective,
    },
    {
      id: 'permissions',
      label: 'Permissões de Cargos',
      icon: Shield,
      visible: isCreatorEffective,
    },
    {
      id: 'gateways',
      label: isCreatorEffective ? 'Pagamentos & Vendas' : 'Vendas',
      icon: CreditCard,
      visible: session.permissions.manage_gateways || session.permissions.view_orders || isCreatorEffective,
    },
  ];

  const visibleTabs = tabs.filter((t) => t.visible);
  const effectiveTab = visibleTabs.some((t) => t.id === activeTab)
    ? activeTab
    : visibleTabs[0]?.id || 'catalog';

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Horizontal Workspace Tab Navigation */}
      <div className="flex flex-wrap gap-2">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = effectiveTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {effectiveTab === 'catalog' && (
          <AIProductStudio
            products={products}
            canCreate={session.permissions.create_products}
            canEdit={session.permissions.edit_products || isCreatorEffective}
            canDelete={session.permissions.delete_products}
            canUseAI={session.permissions.ai_research}
            initialEditProductId={initialEditProductId}
            onInitialEditHandled={onInitialEditHandled}
            onProductsChanged={onProductsChanged}
            onSendToFacebook={(product, suggestedCaption) => {
              setPreselectedProductId(product.id);
              setPreselectedCaption(suggestedCaption);
              setActiveTab('social');
            }}
          />
        )}

        {effectiveTab === 'social' && (
          <SocialAutomationPanel
            products={products}
            preselectedProductId={preselectedProductId}
            preselectedCaption={preselectedCaption}
          />
        )}

        {effectiveTab === 'users' && isCreatorEffective && (
          <UsersManagementPanel
            onViewProfile={onViewProfile}
            onImpersonate={onImpersonate}
          />
        )}

        {effectiveTab === 'permissions' && isCreatorEffective && (
          <PermissionsPanel
            roleMatrix={session.roleMatrix}
            onMatrixUpdated={onMatrixUpdated}
            onTestRole={onTestRole}
          />
        )}

        {effectiveTab === 'gateways' && (
          <GatewaysOrdersPanel
            showGatewayConfig={isCreatorEffective}
            canManageGateways={session.permissions.manage_gateways}
            canViewOrders={session.permissions.view_orders}
          />
        )}
      </div>
    </section>
  );
}
