export type PaymentMethod = 'qris' | 'va_bank' | 'ewallet' | 'cashier';
export type PaymentStatus = 'unpaid' | 'verifying' | 'paid' | 'failed';
export type OrderStatus = 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type MenuCategory =
  | 'Coffee & Espresso'
  | 'Non-Coffee'
  | 'Pastry & Makanan'
  | 'Paket Ngopi'
  | 'Makanan Berat'
  | 'Minuman'
  | 'Camilan'
  | 'Paket Hemat';
export type TableArea = 'Dine-In' | 'Takeaway' | 'Delivery' | 'Event';

export const ADMIN_BOOTSTRAP_EMAIL = 'halimmaulana313@gmail.com';

// Schema boundary constants synchronized with firebase-blueprint.json & firestore.rules
export const LIMITS = {
  STORE_NAME_MAX: 80,
  TAGLINE_MAX: 160,
  ADDRESS_MAX: 200,
  PHONE_MAX: 25,
  MENU_NAME_MAX: 100,
  MENU_DESC_MAX: 300,
  TABLE_CODE_MAX: 40,
  TABLE_LABEL_MAX: 60,
  ALIAS_MAX: 60,
  NOTES_MAX: 240,
  ITEM_NOTE_MAX: 120,
  DELIVERY_ADDR_MAX: 250,
  PAYMENT_REF_MAX: 80,
  MAX_ORDER_ITEMS: 25,
  QRIS_IMAGE_MAX: 260000,
} as const;

export interface StoreConfig {
  storeName: string;
  tagline: string;
  address: string;
  whatsappNumber: string;
  isOpen: boolean;
  taxPercent: number;
  serviceFee: number;
  qrisMerchantName: string;
  qrisNmid: string;
  qrisImageUrl?: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  ewalletLabel: string;
  enabledPayments: PaymentMethod[];
  updatedAt?: unknown;
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  description: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
  isFeatured: boolean;
  prepMinutes: number;
  sortOrder: number;
  updatedAt?: unknown;
}

export interface QrTable {
  id: string;
  code: string;
  label: string;
  area: TableArea;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OrderItemPayload {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
}

export interface OrderRecord {
  id: string;
  orderCode: string;
  tableCode: string;
  tableLabel: string;
  orderType: OrderType;
  customerAlias: string;
  customerUid?: string;
  items: OrderItemPayload[];
  subtotal: number;
  taxAmount: number;
  serviceFee: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentRef: string;
  orderStatus: OrderStatus;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OrderPrivateContact {
  orderId: string;
  customerUid?: string;
  customerPhone: string;
  deliveryAddress: string;
  createdAt?: unknown;
}

export interface OrderStatusLookup {
  orderId: string;
  orderCode: string;
  tableLabel: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  updatedAt?: unknown;
}

export interface CartItem {
  menuItem: MenuItem;
  qty: number;
  note: string;
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function sanitizeIdSegment(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

export function generateOrderId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand += chars[Math.floor(Math.random() * chars.length)];
  }
  return `ord_${Date.now().toString(36)}_${rand}`;
}

export function generateOrderCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const c1 = alpha[Math.floor(Math.random() * alpha.length)];
  const c2 = alpha[Math.floor(Math.random() * alpha.length)];
  return `ORD-${c1}${c2}${num}`;
}

export function formatTimestamp(ts: unknown): string {
  if (!ts) return 'Baru saja';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    const d = (ts as { toDate: () => Date }).toDate();
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }
  if (ts instanceof Date) {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ts);
  }
  return 'Baru saja';
}

export const PAYMENT_METHOD_META: Record<PaymentMethod, { label: string; shortLabel: string; description: string }> = {
  qris: {
    label: 'QRIS Dinamis (Semua E-Wallet & M-Banking)',
    shortLabel: 'QRIS',
    description: 'Scan otomatis dengan nominal pas via GoPay, OVO, DANA, ShopeePay, BCA, Mandiri, BRI.',
  },
  va_bank: {
    label: 'Transfer Bank / Virtual Account',
    shortLabel: 'Transfer Bank',
    description: 'Transfer ke rekening resmi UMKM atau nomor Virtual Account pesanan.',
  },
  ewallet: {
    label: 'E-Wallet Langsung (GoPay / DANA / OVO)',
    shortLabel: 'E-Wallet',
    description: 'Kirim cepat ke nomor dompet digital resmi toko.',
  },
  cashier: {
    label: 'Bayar di Kasir / Tunai Saat Ambil',
    shortLabel: 'Bayar di Kasir',
    description: 'Pesanan langsung diteruskan ke dapur, pembayaran dilakukan di kasir.',
  },
};

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: 'emerald' | 'amber' | 'slate' | 'red' }> = {
  new: { label: 'Pesanan Masuk', tone: 'amber' },
  preparing: { label: 'Diproses Dapur', tone: 'amber' },
  ready: { label: 'Siap Disajikan', tone: 'emerald' },
  completed: { label: 'Selesai', tone: 'slate' },
  cancelled: { label: 'Dibatalkan', tone: 'red' },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; tone: 'emerald' | 'amber' | 'red' }> = {
  unpaid: { label: 'Belum Dibayar', tone: 'red' },
  verifying: { label: 'Menunggu Verifikasi', tone: 'amber' },
  paid: { label: 'Lunas Terverifikasi', tone: 'emerald' },
  failed: { label: 'Pembayaran Gagal', tone: 'red' },
};
