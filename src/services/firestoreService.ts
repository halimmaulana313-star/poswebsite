import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import {
  DEFAULT_STORE_CONFIG,
  STARTER_MENU_ITEMS,
  STARTER_QR_TABLES,
} from '../data/defaults';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  CartItem,
  generateOrderCode,
  generateOrderId,
  LIMITS,
  MenuItem,
  OrderItemPayload,
  OrderPrivateContact,
  OrderRecord,
  OrderStatus,
  OrderStatusLookup,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  QrTable,
  sanitizeIdSegment,
  StoreConfig,
} from '../types';

function clampString(val: string, max: number, fallback = ''): string {
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
}

export function subscribeStoreConfig(
  onData: (config: StoreConfig, existsInDb: boolean) => void
): Unsubscribe {
  const path = 'store_config/main';
  return onSnapshot(
    doc(db, 'store_config', 'main'),
    (snap) => {
      if (snap.exists()) {
        onData({ ...DEFAULT_STORE_CONFIG, ...(snap.data() as Partial<StoreConfig>) }, true);
      } else {
        onData(DEFAULT_STORE_CONFIG, false);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeMenuItems(
  onData: (items: MenuItem[], existsInDb: boolean) => void
): Unsubscribe {
  const path = 'menu_items';
  const q = query(collection(db, path), orderBy('sortOrder', 'asc'), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        onData(STARTER_MENU_ITEMS, false);
      } else {
        const items = snap.docs.map((d) => ({
          ...(d.data() as Omit<MenuItem, 'id'>),
          id: d.id,
        }));
        onData(items, true);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeQrTables(
  onData: (tables: QrTable[], existsInDb: boolean) => void
): Unsubscribe {
  const path = 'qr_tables';
  const q = query(collection(db, path), orderBy('code', 'asc'), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        onData(STARTER_QR_TABLES, false);
      } else {
        const tables = snap.docs.map((d) => ({
          ...(d.data() as Omit<QrTable, 'id'>),
          id: d.id,
        }));
        onData(tables, true);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAdminOrders(
  onData: (orders: OrderRecord[]) => void
): Unsubscribe {
  const path = 'orders';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(250));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        ...(d.data() as Omit<OrderRecord, 'id'>),
        id: d.id,
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeOrderById(
  orderId: string,
  onData: (order: OrderRecord | null) => void
): Unsubscribe {
  const trimmedId = orderId.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(trimmedId) || (trimmedId.length < 16 && !auth.currentUser)) {
    onData(null);
    return () => {};
  }
  const path = `orders/${trimmedId}`;
  return onSnapshot(
    doc(db, 'orders', trimmedId),
    (snap) => {
      if (snap.exists()) {
        onData({ ...(snap.data() as Omit<OrderRecord, 'id'>), id: snap.id });
      } else {
        onData(null);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function lookupOrderByCode(orderCode: string): Promise<OrderStatusLookup | null> {
  const normalized = orderCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
  if (!normalized) return null;
  const path = `order_status_lookup/${normalized}`;
  try {
    const snap = await getDoc(doc(db, 'order_status_lookup', normalized));
    if (!snap.exists()) return null;
    return snap.data() as OrderStatusLookup;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getOrderPrivateContact(orderId: string): Promise<OrderPrivateContact | null> {
  const path = `orders/${orderId}/private/contact`;
  try {
    const snap = await getDoc(doc(db, 'orders', orderId, 'private', 'contact'));
    if (!snap.exists()) return null;
    return snap.data() as OrderPrivateContact;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export interface CreateOrderInput {
  cart: CartItem[];
  tableCode: string;
  tableLabel: string;
  orderType: OrderType;
  customerAlias: string;
  customerPhone: string;
  deliveryAddress: string;
  notes: string;
  paymentMethod: PaymentMethod;
  storeConfig: StoreConfig;
}

export async function createCustomerOrder(input: CreateOrderInput): Promise<{ orderId: string; orderCode: string }> {
  if (input.cart.length === 0) {
    throw new Error('Keranjang masih kosong.');
  }

  const boundedCart = input.cart.slice(0, LIMITS.MAX_ORDER_ITEMS);
  const items: OrderItemPayload[] = boundedCart.map((c) => {
    const base: OrderItemPayload = {
      menuItemId: clampString(c.menuItem.id, 128, 'item'),
      name: clampString(c.menuItem.name, LIMITS.MENU_NAME_MAX, 'Menu'),
      price: Math.max(0, Math.round(c.menuItem.price)),
      qty: Math.min(99, Math.max(1, Math.round(c.qty))),
    };
    const trimmedNote = c.note.trim().slice(0, LIMITS.ITEM_NOTE_MAX);
    if (trimmedNote) {
      base.note = trimmedNote;
    }
    return base;
  });

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const taxAmount = Math.round((subtotal * Math.max(0, input.storeConfig.taxPercent)) / 100);
  const serviceFee = Math.max(0, Math.round(input.storeConfig.serviceFee));
  const totalAmount = Math.max(1, subtotal + taxAmount + serviceFee);

  const orderId = generateOrderId();
  const orderCode = generateOrderCode();
  const rawTableCode = sanitizeIdSegment(input.tableCode);
  const safeTableCode = rawTableCode.length >= 2 ? rawTableCode : 'Takeaway';
  const rawTableLabel = clampString(input.tableLabel, LIMITS.TABLE_LABEL_MAX, 'Takeaway');
  const safeTableLabel = rawTableLabel.length >= 2 ? rawTableLabel : 'Takeaway';
  const safeAlias = clampString(input.customerAlias, LIMITS.ALIAS_MAX, 'Pelanggan');
  const safePhone = clampString(input.customerPhone, LIMITS.PHONE_MAX, '0800000000');
  const safeDeliveryAddr = input.deliveryAddress.trim().slice(0, LIMITS.DELIVERY_ADDR_MAX);
  const safeNotes = input.notes.trim().slice(0, LIMITS.NOTES_MAX);
  const uid = auth.currentUser?.uid;

  const orderDoc: Record<string, unknown> = {
    orderCode,
    tableCode: safeTableCode,
    tableLabel: safeTableLabel,
    orderType: input.orderType,
    customerAlias: safeAlias,
    items,
    subtotal,
    taxAmount,
    serviceFee,
    totalAmount,
    paymentMethod: input.paymentMethod,
    paymentStatus: 'unpaid' as PaymentStatus,
    paymentRef: '',
    orderStatus: 'new' as OrderStatus,
    notes: safeNotes,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (uid) {
    orderDoc.customerUid = uid;
  }

  const privateDoc: Record<string, unknown> = {
    orderId,
    customerPhone: safePhone,
    deliveryAddress: safeDeliveryAddr,
    createdAt: serverTimestamp(),
  };

  if (uid) {
    privateDoc.customerUid = uid;
  }

  const lookupDoc: Record<string, unknown> = {
    orderId,
    orderCode,
    tableLabel: safeTableLabel,
    totalAmount,
    paymentMethod: input.paymentMethod,
    paymentStatus: 'unpaid' as PaymentStatus,
    orderStatus: 'new' as OrderStatus,
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'orders', orderId), orderDoc);
  batch.set(doc(db, 'orders', orderId, 'private', 'contact'), privateDoc);
  batch.set(doc(db, 'order_status_lookup', orderCode), lookupDoc);

  try {
    await batch.commit();
    return { orderId, orderCode };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
  }
}

export async function submitCustomerPaymentConfirmation(
  orderId: string,
  orderCode: string,
  paymentRef: string
): Promise<void> {
  const safeRef = clampString(paymentRef, LIMITS.PAYMENT_REF_MAX, `CONFIRMED-${orderCode}`);
  const batch = writeBatch(db);
  batch.update(doc(db, 'orders', orderId), {
    paymentStatus: 'verifying',
    paymentRef: safeRef,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'order_status_lookup', orderCode), {
    paymentStatus: 'verifying',
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function adminUpdateOrderStatus(
  orderId: string,
  orderCode: string,
  updates: {
    orderStatus?: OrderStatus;
    paymentStatus?: PaymentStatus;
    paymentRef?: string;
    notes?: string;
  }
): Promise<void> {
  const orderPatch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  const lookupPatch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.orderStatus) {
    orderPatch.orderStatus = updates.orderStatus;
    lookupPatch.orderStatus = updates.orderStatus;
  }
  if (updates.paymentStatus) {
    orderPatch.paymentStatus = updates.paymentStatus;
    lookupPatch.paymentStatus = updates.paymentStatus;
  }
  if (typeof updates.paymentRef === 'string') {
    orderPatch.paymentRef = updates.paymentRef.trim().slice(0, LIMITS.PAYMENT_REF_MAX);
  }
  if (typeof updates.notes === 'string') {
    orderPatch.notes = updates.notes.trim().slice(0, LIMITS.NOTES_MAX);
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'orders', orderId), orderPatch);
  batch.update(doc(db, 'order_status_lookup', orderCode), lookupPatch);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

export async function adminSaveStoreConfig(config: StoreConfig): Promise<void> {
  const path = 'store_config/main';
  const payload = {
    storeName: clampString(config.storeName, LIMITS.STORE_NAME_MAX, 'Dapur Saji Nusantara'),
    tagline: clampString(config.tagline, LIMITS.TAGLINE_MAX, 'Kuliner hangat UMKM setiap hari.'),
    address: clampString(config.address, LIMITS.ADDRESS_MAX, 'Indonesia'),
    whatsappNumber: clampString(config.whatsappNumber.replace(/[^0-9+\-\s]/g, ''), 20, '+6281234567890'),
    isOpen: Boolean(config.isOpen),
    taxPercent: Math.min(25, Math.max(0, Number(config.taxPercent) || 0)),
    serviceFee: Math.min(50000, Math.max(0, Math.round(Number(config.serviceFee) || 0))),
    qrisMerchantName: clampString(config.qrisMerchantName, LIMITS.STORE_NAME_MAX, 'UMKM MERCHANT'),
    qrisNmid: clampString(config.qrisNmid.replace(/[^A-Za-z0-9-]/g, ''), 40, 'ID1026048829104'),
    qrisImageUrl: (config.qrisImageUrl || '').trim().slice(0, LIMITS.QRIS_IMAGE_MAX),
    bankName: clampString(config.bankName, 40, 'Bank BCA'),
    bankAccountNumber: clampString(config.bankAccountNumber.replace(/[^0-9-]/g, ''), 30, '5420881920'),
    bankAccountHolder: clampString(config.bankAccountHolder, LIMITS.STORE_NAME_MAX, 'Pemilik UMKM'),
    ewalletLabel: clampString(config.ewalletLabel, 80, 'GoPay / DANA · 081234567890'),
    enabledPayments: config.enabledPayments.length > 0 ? config.enabledPayments.slice(0, 4) : ['qris', 'cashier'],
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'store_config', 'main'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminSaveMenuItem(item: MenuItem): Promise<void> {
  const safeId = sanitizeIdSegment(item.id) || `menu_${Date.now().toString(36)}`;
  const path = `menu_items/${safeId}`;
  const payload = {
    name: clampString(item.name, LIMITS.MENU_NAME_MAX, 'Menu Baru'),
    category: item.category,
    description: clampString(item.description, LIMITS.MENU_DESC_MAX, 'Sajian khas UMKM.'),
    price: Math.min(10000000, Math.max(0, Math.round(Number(item.price) || 0))),
    imageUrl: clampString(item.imageUrl, 500, '/src/assets/images/menu_ayam_bakar_1794945244424.jpg'),
    isAvailable: Boolean(item.isAvailable),
    isFeatured: Boolean(item.isFeatured),
    prepMinutes: Math.min(120, Math.max(1, Math.round(Number(item.prepMinutes) || 10))),
    sortOrder: Math.min(9999, Math.max(0, Math.round(Number(item.sortOrder) || 1))),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'menu_items', safeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminDeleteMenuItem(itemId: string): Promise<void> {
  const path = `menu_items/${itemId}`;
  try {
    await deleteDoc(doc(db, 'menu_items', itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminSaveQrTable(table: QrTable, isNew: boolean): Promise<void> {
  const safeCode = sanitizeIdSegment(table.code) || `Meja-${Date.now().toString(36).slice(-4)}`;
  const safeId = sanitizeIdSegment(table.id) || `tbl_${safeCode.toLowerCase()}`;
  const path = `qr_tables/${safeId}`;
  const payload = {
    code: safeCode,
    label: clampString(table.label, LIMITS.TABLE_LABEL_MAX, safeCode),
    area: table.area,
    isActive: Boolean(table.isActive),
    createdAt: isNew || !table.createdAt ? serverTimestamp() : table.createdAt,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'qr_tables', safeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminDeleteQrTable(tableId: string): Promise<void> {
  const path = `qr_tables/${tableId}`;
  try {
    await deleteDoc(doc(db, 'qr_tables', tableId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminSeedStarterData(): Promise<void> {
  const existingTableSnaps = await Promise.all(
    STARTER_QR_TABLES.map((t) => getDoc(doc(db, 'qr_tables', t.id)))
  );

  const batch = writeBatch(db);
  batch.set(doc(db, 'store_config', 'main'), {
    ...DEFAULT_STORE_CONFIG,
    updatedAt: serverTimestamp(),
  });

  for (const item of STARTER_MENU_ITEMS) {
    const { id, ...rest } = item;
    batch.set(doc(db, 'menu_items', id), {
      ...rest,
      updatedAt: serverTimestamp(),
    });
  }

  STARTER_QR_TABLES.forEach((table, idx) => {
    const { id, ...rest } = table;
    const existingSnap = existingTableSnaps[idx];
    const preservedCreatedAt = existingSnap?.exists()
      ? existingSnap.data()?.createdAt
      : undefined;
    batch.set(doc(db, 'qr_tables', id), {
      ...rest,
      createdAt: preservedCreatedAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seed_starter_data');
  }
}
