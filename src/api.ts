import type {
  FacebookTargetType,
  Order,
  PaymentGateway,
  Product,
  PublicUser,
  Role,
  RolePermissionsMap,
  SessionState,
  SocialAccount,
  SocialPost,
} from './types';

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Erro na requisição (${res.status})`);
  }
  return data;
}

export const api = {
  getMe: () => apiFetch<SessionState>('/api/auth/me'),

  login: async (username: string, password: string) => {
    const res = await apiFetch<SessionState>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return res;
  },

  register: async (payload: {
    username: string;
    displayName: string;
    password: string;
    city?: string;
    phone?: string;
  }) => {
    const res = await apiFetch<SessionState>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  updateCredentials: (payload: {
    currentPassword: string;
    newUsername?: string;
    newPassword?: string;
  }) =>
    apiFetch<{ user: PublicUser }>('/api/auth/credentials', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  logout: async () => {
    await apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  impersonate: (userId: string) =>
    apiFetch<SessionState>('/api/auth/impersonate', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  stopImpersonate: () =>
    apiFetch<SessionState>('/api/auth/stop-impersonate', { method: 'POST' }),

  testRole: (role: Role) =>
    apiFetch<SessionState>('/api/auth/test-role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  getUsers: () =>
    apiFetch<{
      users: Array<PublicUser & { ordersCount: number; totalSpent: number }>;
    }>('/api/users'),

  getUserProfile: (userId: string) =>
    apiFetch<{ profile: PublicUser; orders: Order[]; canManage: boolean }>(
      `/api/users/${encodeURIComponent(userId)}/profile`
    ),

  toggleBanUser: (userId: string, banned: boolean) =>
    apiFetch<{ user: PublicUser }>(`/api/users/${encodeURIComponent(userId)}/ban`, {
      method: 'PATCH',
      body: JSON.stringify({ banned }),
    }),

  deleteUser: (userId: string) =>
    apiFetch<{ ok: boolean }>(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),

  updatePermissions: (roleMatrix: RolePermissionsMap) =>
    apiFetch<{ roleMatrix: RolePermissionsMap }>('/api/permissions', {
      method: 'PUT',
      body: JSON.stringify({ roleMatrix }),
    }),

  getProducts: () => apiFetch<{ products: Product[] }>('/api/products'),

  createProduct: (payload: Partial<Product>) =>
    apiFetch<{ product: Product }>('/api/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProduct: (id: string, payload: Partial<Product>) =>
    apiFetch<{ product: Product }>(`/api/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteProduct: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  trackProductClick: (id: string, ref?: string) =>
    apiFetch<{ clicksFromSocial: number }>(
      `/api/products/${encodeURIComponent(id)}/track-click`,
      {
        method: 'POST',
        body: JSON.stringify({ ref }),
      }
    ),

  researchProductAI: (payload: {
    query?: string;
    imageUrl?: string;
    imageDataUrl?: string;
  }) =>
    apiFetch<{
      result: {
        name: string;
        minPrice: number | null;
        maxPrice: number | null;
        avgPrice: number | null;
        suggestedPrice: number | null;
        priceCount: number;
        description: string;
        category: string;
        tags: string[];
        facebookCaption: string;
        imageUrl: string;
        sources: Array<{ title: string; uri: string }>;
      };
    }>('/api/ai/research-product', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAiImageStatus: () =>
    apiFetch<{ enabled: boolean; reason: string }>('/api/ai/image-status'),

  getFacebookAuthUrl: () =>
    apiFetch<{ configured: boolean; callbackUrl: string; url: string | null }>(
      '/api/social/facebook/auth-url'
    ),

  getSocialState: () =>
    apiFetch<{ accounts: SocialAccount[]; posts: SocialPost[] }>('/api/social/state'),

  connectFacebook: (payload: {
    accountName?: string;
    defaultTargetType: FacebookTargetType;
    selectedGroupIds: string[];
    autoPostEnabled: boolean;
    customGroupName?: string;
  }) =>
    apiFetch<{ account: SocialAccount }>('/api/social/connect-facebook', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createSocialPost: (payload: {
    productId: string;
    targetType: FacebookTargetType;
    selectedGroupIds: string[];
    caption: string;
    publishNow: boolean;
    scheduledFor?: string;
    baseOrigin: string;
  }) =>
    apiFetch<{ post: SocialPost }>('/api/social/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  publishSocialPostNow: (id: string) =>
    apiFetch<{ post: SocialPost }>(
      `/api/social/posts/${encodeURIComponent(id)}/publish`,
      { method: 'POST' }
    ),

  deleteSocialPost: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/social/posts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  getGateways: () => apiFetch<{ gateways: PaymentGateway[] }>('/api/gateways'),

  updateGateway: (id: string, payload: Partial<PaymentGateway>) =>
    apiFetch<{ gateway: PaymentGateway }>(`/api/gateways/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getOrders: () => apiFetch<{ orders: Order[] }>('/api/orders'),

  confirmPixOrder: (id: string) =>
    apiFetch<{ order: Order }>(`/api/orders/${encodeURIComponent(id)}/confirm-pix`, {
      method: 'POST',
    }),

  createOrder: (payload: {
    items: Array<{ productId: string; quantity: number }>;
    gatewayId: string;
    customerName: string;
    customerPhone: string;
    shippingAddress: string;
    sourceRef?: string;
  }) =>
    apiFetch<{ order: Order; checkoutUrl?: string }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
