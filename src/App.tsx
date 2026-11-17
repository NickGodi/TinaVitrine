import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthModal } from './components/AuthModal';
import { CartCheckoutDrawer } from './components/CartCheckoutDrawer';
import type { CartItem } from './components/CartCheckoutDrawer';
import { Header } from './components/Header';
import { ProductDetailModal } from './components/ProductDetailModal';
import { ProfileView } from './components/ProfileView';
import { Storefront } from './components/Storefront';
import type {
  PaymentGateway,
  Product,
  ProductFilterOptions,
  Role,
  RolePermissionsMap,
  SessionState,
} from './types';

const EMPTY_SESSION: SessionState = {
  realUser: null,
  effectiveUser: null,
  effectiveRole: 'guest',
  isImpersonating: false,
  testingRole: null,
  permissions: {
    view_store: true,
    buy_products: true,
    create_products: false,
    edit_products: false,
    delete_products: false,
    ai_research: false,
    social_autopost: false,
    manage_gateways: false,
    view_orders: false,
    view_analytics: false,
  },
  roleMatrix: {
    creator: {
      view_store: true,
      buy_products: true,
      create_products: true,
      edit_products: true,
      delete_products: true,
      ai_research: true,
      social_autopost: true,
      manage_gateways: true,
      view_orders: true,
      view_analytics: true,
    },
    admin: {
      view_store: true,
      buy_products: true,
      create_products: true,
      edit_products: true,
      delete_products: false,
      ai_research: true,
      social_autopost: true,
      manage_gateways: false,
      view_orders: true,
      view_analytics: true,
    },
    user: {
      view_store: true,
      buy_products: true,
      create_products: false,
      edit_products: false,
      delete_products: false,
      ai_research: false,
      social_autopost: false,
      manage_gateways: false,
      view_orders: false,
      view_analytics: false,
    },
    guest: {
      view_store: true,
      buy_products: true,
      create_products: false,
      edit_products: false,
      delete_products: false,
      ai_research: false,
      social_autopost: false,
      manage_gateways: false,
      view_orders: false,
      view_analytics: false,
    },
  },
};

const CART_STORAGE_PREFIX = 'tv_cart_v1:';

function loadCartForOwner(ownerKey: string): CartItem[] {
  try {
    const stored = localStorage.getItem(`${CART_STORAGE_PREFIX}${ownerKey}`);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed as CartItem[] : [];
  } catch {
    return [];
  }
}

function saveCartForOwner(ownerKey: string, items: CartItem[]) {
  try {
    const storageKey = `${CART_STORAGE_PREFIX}${ownerKey}`;
    if (items.length) {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {
    // Keep the in-memory cart usable if browser storage is unavailable.
  }
}

export default function App() {
  const [session, setSession] = useState<SessionState>(EMPTY_SESSION);
  const cartOwnerKey = session.effectiveUser?.id ?? 'guest';
  const [products, setProducts] = useState<Product[]>([]);
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [loading, setLoading] = useState(true);

  // Default White Light Theme; optional Dark mode persisted in localStorage
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vp_theme') === 'dark';
    } catch {
      return false;
    }
  });

  const [activeView, setActiveView] = useState<'store' | 'admin' | 'profile'>('store');
  const [inspectedProfileId, setInspectedProfileId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productToEditId, setProductToEditId] = useState<string | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartState, setCartState] = useState<{ ownerKey: string; items: CartItem[] }>(() => ({
    ownerKey: cartOwnerKey,
    items: loadCartForOwner(cartOwnerKey),
  }));
  const cart = cartState.ownerKey === cartOwnerKey ? cartState.items : [];
  const [paymentNotice, setPaymentNotice] = useState('');
  const [sourceRef, setSourceRef] = useState<string>('direct');

  function updateCartForCurrentOwner(update: (items: CartItem[]) => CartItem[]) {
    setCartState((previous) => ({
      ownerKey: cartOwnerKey,
      items: update(
        previous.ownerKey === cartOwnerKey
          ? previous.items
          : loadCartForOwner(cartOwnerKey)
      ),
    }));
  }

  useEffect(() => {
    if (cartState.ownerKey !== cartOwnerKey) {
      setCartState({ ownerKey: cartOwnerKey, items: loadCartForOwner(cartOwnerKey) });
      setCartOpen(false);
      setPaymentNotice('');
      return;
    }

    saveCartForOwner(cartOwnerKey, cartState.items);
  }, [cartOwnerKey, cartState]);

  useEffect(() => {
    try {
      // The old pending-checkout cart did not record which account owned it.
      sessionStorage.removeItem('tv_stripe_pending_cart');
    } catch {
      // Ignore browser storage restrictions.
    }
  }, []);

  const [filters, setFilters] = useState<ProductFilterOptions>({
    search: '',
    category: 'Todas',
    tag: '',
    minPrice: null,
    maxPrice: null,
    sortBy: 'newest',
  });

  const catalogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('vp_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('vp_theme', 'light');
    }
  }, [darkMode]);

  const refreshData = useCallback(async () => {
    try {
      const [me, prodRes, gwRes] = await Promise.all([
        api.getMe(),
        api.getProducts().catch(() => ({ products: [] })),
        api.getGateways().catch(() => ({ gateways: [] })),
      ]);
      setSession(me);
      setProducts(prodRes.products);
      setGateways(gwRes.gateways);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData().then(() => {
      const params = new URLSearchParams(window.location.search);
      const prodParam = params.get('produto');
      const refParam = params.get('ref');
      if (refParam) setSourceRef(refParam);
      if (prodParam) {
        api.trackProductClick(prodParam, refParam || undefined).catch(() => {});
      }
    });
  }, [refreshData]);

  useEffect(() => {
    if (loading) return;
    const url = new URL(window.location.href);
    const paymentResult = url.searchParams.get('pagamento');
    if (!paymentResult) return;

    if (paymentResult === 'confirmado') {
      setPaymentNotice('Pagamento confirmado pelo Stripe. Seu pedido foi registrado.');
      updateCartForCurrentOwner(() => []);
    } else if (paymentResult === 'cancelado') {
      setPaymentNotice('Checkout cancelado. Os itens continuam na sua sacola.');
    } else if (paymentResult === 'pendente') {
      setPaymentNotice('O Stripe ainda não confirmou esse pagamento. Confira o status do pedido antes de tentar novamente.');
    } else {
      setPaymentNotice('Não foi possível confirmar o pagamento pelo Stripe. Entre em contato para verificar o pedido.');
    }

    url.searchParams.delete('pagamento');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [loading, cartOwnerKey]);

  // Open product automatically if URL has ?produto=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prodParam = params.get('produto');
    if (prodParam && products.length > 0 && !selectedProduct) {
      const found = products.find((p) => p.id === prodParam || p.slug === prodParam);
      if (found) setSelectedProduct(found);
    }
  }, [products]);

  const canOpenPanel =
    session.permissions.create_products ||
    session.permissions.edit_products ||
    session.permissions.ai_research ||
    session.permissions.social_autopost ||
    session.permissions.manage_gateways ||
    session.effectiveRole === 'creator';

  useEffect(() => {
    if (activeView === 'admin' && !canOpenPanel) {
      setActiveView('store');
    }
  }, [activeView, canOpenPanel]);

  function handleSelectCategory(category: string) {
    setActiveView('store');
    setFilters((prev) => ({ ...prev, category, tag: '' }));
    setTimeout(() => catalogRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }

  function handleSelectTag(tag: string) {
    setActiveView('store');
    setFilters((prev) => ({ ...prev, search: '', category: 'Todas', tag }));
    setTimeout(() => catalogRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  }

  function handleAddToCart(product: Product, quantity = 1) {
    updateCartForCurrentOwner((prev) => {
      const existing = prev.find((it) => it.product.id === product.id);
      if (existing) {
        return prev.map((it) =>
          it.product.id === product.id
            ? { ...it, quantity: Math.min(product.stock, it.quantity + quantity) }
            : it
        );
      }
      return [...prev, { product, quantity }];
    });
    setCartOpen(true);
  }

  function handleBuyNow(product: Product, quantity = 1) {
    handleAddToCart(product, quantity);
    setSelectedProduct(null);
  }

  function handleEditProductFromDetails(product: Product) {
    setSelectedProduct(null);
    setProductToEditId(product.id);
    setActiveView('admin');
  }

  const clearProductToEditId = useCallback(() => setProductToEditId(null), []);

  async function handleLogin(username: string, password: string) {
    const res = await api.login(username, password);
    setSession(res);
    await refreshData();
  }

  async function handleRegister(payload: {
    username: string;
    displayName: string;
    password: string;
    city?: string;
    phone?: string;
  }) {
    const res = await api.register(payload);
    setSession(res);
    await refreshData();
  }

  async function handleLogout() {
    await api.logout();
    setActiveView('store');
    setInspectedProfileId(null);
    await refreshData();
  }

  async function handleTestRole(role: Role) {
    const next = await api.testRole(role);
    setSession(next);
    await refreshData();
  }

  async function handleImpersonate(userId: string) {
    const next = await api.impersonate(userId);
    setSession(next);
    setInspectedProfileId(null);
    setActiveView('store');
    await refreshData();
  }

  async function handleStopImpersonate() {
    const next = await api.stopImpersonate();
    setSession(next);
    await refreshData();
  }

  function handleMatrixUpdated(nextMatrix: RolePermissionsMap) {
    setSession((prev) => ({
      ...prev,
      roleMatrix: nextMatrix,
      permissions:
        prev.effectiveRole === 'creator'
          ? prev.permissions
          : nextMatrix[prev.effectiveRole],
    }));
  }

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <Header
        activeView={activeView}
        onNavigate={(view) => {
          setInspectedProfileId(null);
          setActiveView(view);
        }}
        onScrollToCatalog={() => catalogRef.current?.scrollIntoView({ behavior: 'smooth' })}
        session={session}
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
        onTestRole={handleTestRole}
        onStopImpersonate={handleStopImpersonate}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
      />

      {paymentNotice && (
        <div
          role="status"
          className="mx-auto mt-4 flex w-full max-w-7xl items-start justify-between gap-4 px-4 sm:px-6"
        >
          <p className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            {paymentNotice}
          </p>
          <button
            type="button"
            onClick={() => setPaymentNotice('')}
            className="rounded-md border border-zinc-200 px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Fechar
          </button>
        </div>
      )}

      <main className="flex-1">
        {loading ? (
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
            <div className="h-80 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          </div>
        ) : activeView === 'admin' && canOpenPanel ? (
          <AdminDashboard
            session={session}
            products={products}
            initialEditProductId={productToEditId}
            onInitialEditHandled={clearProductToEditId}
            onProductsChanged={refreshData}
            onViewProfile={(uid) => {
              setInspectedProfileId(uid);
              setActiveView('profile');
            }}
            onImpersonate={handleImpersonate}
            onMatrixUpdated={handleMatrixUpdated}
            onTestRole={handleTestRole}
          />
        ) : activeView === 'profile' && (inspectedProfileId || session.effectiveUser) ? (
          <ProfileView
            userId={inspectedProfileId || session.effectiveUser!.id}
            isCreatorViewing={
              session.realUser?.role === 'creator' && session.effectiveRole === 'creator'
            }
            canChangeCredentials={
              !inspectedProfileId &&
              !session.isImpersonating &&
              Boolean(session.realUser && session.effectiveUser && session.realUser.id === session.effectiveUser.id)
            }
            onBack={
              inspectedProfileId
                ? () => {
                    setInspectedProfileId(null);
                    setActiveView('admin');
                  }
                : undefined
            }
            onImpersonate={handleImpersonate}
            onUserUpdated={refreshData}
          />
        ) : !session.permissions.view_store ? (
          <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
              Vitrine restrita para este cargo
            </h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              A permissão de visualização da vitrine foi desabilitada para o cargo atual.
            </p>
          </section>
        ) : (
          <Storefront
            products={products}
            filters={filters}
            onChangeFilters={setFilters}
            onSelectCategory={handleSelectCategory}
            onOpenProduct={setSelectedProduct}
            onAddToCart={(prod) => handleAddToCart(prod, 1)}
            canBuy={session.permissions.buy_products}
            canOpenPanel={canOpenPanel}
            onOpenPanel={() => setActiveView('admin')}
            catalogRef={catalogRef}
          />
        )}
      </main>

      <footer className="border-t border-zinc-200 bg-white py-8 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} TinaVitrine. Todos os direitos reservados.</p>
        </div>
      </footer>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />

      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onSelectCategory={handleSelectCategory}
        onSelectTag={handleSelectTag}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        canBuy={session.permissions.buy_products}
        canEdit={session.permissions.edit_products || session.effectiveRole === 'creator'}
        onEdit={handleEditProductFromDetails}
      />

      <CartCheckoutDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        onUpdateQty={(productId, qty) => {
          if (qty <= 0) {
            updateCartForCurrentOwner((prev) => prev.filter((it) => it.product.id !== productId));
          } else {
            updateCartForCurrentOwner((prev) =>
              prev.map((it) =>
                it.product.id === productId
                  ? { ...it, quantity: Math.min(it.product.stock, qty) }
                  : it
              )
            );
          }
        }}
        onRemoveItem={(productId) =>
          updateCartForCurrentOwner((prev) => prev.filter((it) => it.product.id !== productId))
        }
        onClearCart={() => updateCartForCurrentOwner(() => [])}
        gateways={gateways}
        currentUser={session.effectiveUser}
        sourceRef={sourceRef}
        onOrderCompleted={() => {
          refreshData();
        }}
      />
    </div>
  );
}
