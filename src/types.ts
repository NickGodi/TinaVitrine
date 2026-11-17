export type Role = 'creator' | 'admin' | 'user' | 'guest';

export type PermissionKey =
  | 'view_store'
  | 'buy_products'
  | 'create_products'
  | 'edit_products'
  | 'delete_products'
  | 'ai_research'
  | 'social_autopost'
  | 'manage_gateways'
  | 'view_orders'
  | 'view_analytics';

export type RolePermissionsMap = Record<Role, Record<PermissionKey, boolean>>;

export interface PriceResearch {
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  currency: string;
  sources: Array<{ title: string; uri: string }>;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  minMarketPrice: number;
  maxMarketPrice: number;
  avgMarketPrice: number;
  imageUrl: string;
  stock: number;
  featured: boolean;
  sources: Array<{ title: string; uri: string }>;
  clicksFromSocial: number;
  salesCount: number;
  createdBy: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  banned: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  bio: string;
  city: string;
  phone: string;
}

export interface SessionState {
  realUser: PublicUser | null;
  effectiveUser: PublicUser | null;
  effectiveRole: Role;
  isImpersonating: boolean;
  testingRole: Role | null;
  permissions: Record<PermissionKey, boolean>;
  roleMatrix: RolePermissionsMap;
}

export type FacebookTargetType = 'profile' | 'single_group' | 'multiple_groups';

export interface FacebookGroup {
  id: string;
  name: string;
  membersCount: number;
}

export interface SocialAccount {
  id: string;
  platform: 'facebook';
  accountName: string;
  profileUrl: string;
  connectedAt: string;
  isLiveOAuth: boolean;
  defaultTargetType: FacebookTargetType;
  selectedGroupIds: string[];
  availableGroups: FacebookGroup[];
  autoPostEnabled: boolean;
}

export interface SocialPost {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  buyLink: string;
  platform: 'facebook';
  targetType: FacebookTargetType;
  targetNames: string[];
  caption: string;
  status: 'scheduled' | 'published';
  scheduledFor: string | null;
  publishedAt: string | null;
  clicks: number;
  conversions: number;
  createdAt: string;
}

export interface PaymentGateway {
  id: string;
  provider: 'pix' | 'mercadopago' | 'stripe' | 'pagbank';
  name: string;
  enabled: boolean;
  mode: 'sandbox' | 'production';
  feePercent: number;
  settlementTime: string;
  merchantKeyMasked: string;
  webhookUrl: string;
  configured?: boolean;
  webhookConfigured?: boolean;
}

export interface OrderItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  imageUrl: string;
}

export interface Order {
  id: string;
  userId: string | null;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  items: OrderItem[];
  subtotal: number;
  gatewayFee: number;
  total: number;
  gatewayId: string;
  gatewayName: string;
  paymentStatus: 'paid' | 'pending_pix' | 'processing' | 'cancelled';
  pixCopyPaste?: string;
  paymentReference?: string;
  sourceRef?: string;
  createdAt: string;
}

export interface ProductFilterOptions {
  search: string;
  category: string;
  tag: string;
  minPrice: number | null;
  maxPrice: number | null;
  sortBy: 'newest' | 'price_asc' | 'price_desc' | 'popular';
}
