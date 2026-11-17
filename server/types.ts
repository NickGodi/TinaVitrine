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

export interface StoredUser {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  banned: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  bio: string;
  city: string;
  phone: string;
}

export interface SessionRecord {
  token: string;
  realUserId: string;
  impersonatedUserId: string | null;
  testingRole: Role | null;
  createdAt: string;
}

export interface ProductRecord {
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

export type FacebookTargetType = 'profile' | 'single_group' | 'multiple_groups';

export interface FacebookGroupRecord {
  id: string;
  name: string;
  membersCount: number;
}

export interface SocialAccountRecord {
  id: string;
  platform: 'facebook';
  accountName: string;
  profileUrl: string;
  accessToken?: string;
  connectedAt: string;
  isLiveOAuth: boolean;
  defaultTargetType: FacebookTargetType;
  selectedGroupIds: string[];
  availableGroups: FacebookGroupRecord[];
  autoPostEnabled: boolean;
}

export interface SocialPostRecord {
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

export interface PaymentGatewayRecord {
  id: string;
  provider: 'pix' | 'mercadopago' | 'stripe' | 'pagbank';
  name: string;
  enabled: boolean;
  mode: 'sandbox' | 'production';
  feePercent: number;
  settlementTime: string;
  merchantKeyMasked: string;
  webhookUrl: string;
}

export interface OrderItemRecord {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  imageUrl: string;
}

export interface OrderRecord {
  id: string;
  userId: string | null;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  items: OrderItemRecord[];
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

export interface DatabaseSchema {
  users: StoredUser[];
  sessions: SessionRecord[];
  roleMatrix: RolePermissionsMap;
  products: ProductRecord[];
  socialAccounts: SocialAccountRecord[];
  socialPosts: SocialPostRecord[];
  gateways: PaymentGatewayRecord[];
  orders: OrderRecord[];
}
