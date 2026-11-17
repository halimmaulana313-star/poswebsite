import React, { useEffect, useMemo, useState } from 'react';
import { User, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  LogIn,
  LogOut,
  Pencil,
  Phone,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { CURATED_MENU_IMAGES } from '../data/defaults';
import { auth, db, googleProvider } from '../lib/firebase';
import {
  adminDeleteMenuItem,
  adminDeleteQrTable,
  adminSaveMenuItem,
  adminSaveQrTable,
  adminSaveStoreConfig,
  adminSeedStarterData,
  adminUpdateOrderStatus,
  getOrderPrivateContact,
  subscribeAdminOrders,
} from '../services/firestoreService';
import {
  ADMIN_BOOTSTRAP_EMAIL,
  formatRupiah,
  formatTimestamp,
  LIMITS,
  MenuCategory,
  MenuItem,
  ORDER_STATUS_META,
  OrderPrivateContact,
  OrderRecord,
  OrderStatus,
  PAYMENT_METHOD_META,
  PAYMENT_STATUS_META,
  PaymentMethod,
  QrTable,
  StoreConfig,
  TableArea,
} from '../types';
import { QrCodeCanvas } from './QrCodeCanvas';

interface WebMasterViewProps {
  user: User | null;
  authReady: boolean;
  storeConfig: StoreConfig;
  menuItems: MenuItem[];
  qrTables: QrTable[];
  dbStatus: { config: boolean; menu: boolean; tables: boolean };
  onPreviewTableLink: (tableCode: string) => void;
  onBackToStorefront: () => void;
  onNotify: (msg: string) => void;
}

type MasterTab = 'orders' | 'barcodes' | 'menu' | 'settings';
type OrderFilter = 'all' | 'verifying' | 'active' | 'ready' | 'done';

export const WebMasterView: React.FC<WebMasterViewProps> = ({
  user,
  authReady,
  storeConfig,
  menuItems,
  qrTables,
  dbStatus,
  onPreviewTableLink,
  onBackToStorefront,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<MasterTab>('orders');
  const [isAdminMember, setIsAdminMember] = useState(false);
  const [checkingRole, setCheckingRole] = useState(false);
  const [authError, setAuthError] = useState('');

  // Orders State
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [contactCache, setContactCache] = useState<Record<string, OrderPrivateContact | null>>({});
  const [loadingContactId, setLoadingContactId] = useState<string | null>(null);

  // Bookkeeping Report Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [reportPaidOnly, setReportPaidOnly] = useState(false);

  // Seed State
  const [seeding, setSeeding] = useState(false);

  // QR Barcode Form & Print Modal
  const [editingTable, setEditingTable] = useState<QrTable | null>(null);
  const [tableFormOpen, setTableFormOpen] = useState(false);
  const [tCode, setTCode] = useState('');
  const [tLabel, setTLabel] = useState('');
  const [tArea, setTArea] = useState<TableArea>('Dine-In');
  const [tActive, setTActive] = useState(true);
  const [printTable, setPrintTable] = useState<QrTable | null>(null);

  // Menu Form State
  const [menuFormOpen, setMenuFormOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuItem | null>(null);
  const [mName, setMName] = useState('');
  const [mCategory, setMCategory] = useState<MenuCategory>('Coffee & Espresso');
  const [mPrice, setMPrice] = useState(25000);
  const [mPrep, setMPrep] = useState(10);
  const [mDesc, setMDesc] = useState('');
  const [mImage, setMImage] = useState(CURATED_MENU_IMAGES[0].url);
  const [mAvailable, setMAvailable] = useState(true);
  const [mFeatured, setMFeatured] = useState(false);

  // Store & Payment Settings Form State
  const [cfgDraft, setCfgDraft] = useState<StoreConfig>(storeConfig);
  const [savingConfig, setSavingConfig] = useState(false);
  const [qrisUploading, setQrisUploading] = useState(false);
  const [qrisUploadError, setQrisUploadError] = useState('');

  useEffect(() => {
    setCfgDraft(storeConfig);
  }, [storeConfig]);

  // Verify admin RBAC access
  useEffect(() => {
    let active = true;
    if (!authReady || !user) {
      setIsAdminMember(false);
      return;
    }

    if (user.email === ADMIN_BOOTSTRAP_EMAIL && user.emailVerified) {
      setIsAdminMember(true);
      return;
    }

    setCheckingRole(true);
    getDoc(doc(db, 'admins', user.uid))
      .then((snap) => {
        if (active) {
          setIsAdminMember(snap.exists());
        }
      })
      .catch(() => {
        if (active) setIsAdminMember(false);
      })
      .finally(() => {
        if (active) setCheckingRole(false);
      });

    return () => {
      active = false;
    };
  }, [user, authReady]);

  // Attach real-time orders stream ONLY when verified admin is authenticated
  useEffect(() => {
    if (!authReady || !user || !isAdminMember) {
      setOrders([]);
      return;
    }
    const unsub = subscribeAdminOrders((list) => {
      setOrders(list);
    });
    return () => unsub();
  }, [authReady, user, isAdminMember]);

  const handleGoogleLogin = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal masuk dengan Google.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    onNotify('Anda telah keluar dari panel Web Master.');
  };

  const handleSeedData = async () => {
    setSeeding(true);
    try {
      await adminSeedStarterData();
      onNotify('Profil toko, 7 menu awal, dan 6 barcode meja berhasil disimpan ke Firestore.');
    } catch {
      onNotify('Gagal menginisialisasi data awal. Pastikan akun pemilik terverifikasi.');
    } finally {
      setSeeding(false);
    }
  };

  const orderStats = useMemo(() => {
    const totalOrders = orders.length;
    const verifyingCount = orders.filter((o) => o.paymentStatus === 'verifying').length;
    const activeKitchen = orders.filter(
      (o) => o.orderStatus === 'new' || o.orderStatus === 'preparing'
    ).length;
    const paidRevenue = orders
      .filter((o) => o.paymentStatus === 'paid' && o.orderStatus !== 'cancelled')
      .reduce((sum, o) => sum + o.totalAmount, 0);
    return { totalOrders, verifyingCount, activeKitchen, paidRevenue };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (orderFilter === 'verifying') return o.paymentStatus === 'verifying' || o.paymentStatus === 'unpaid';
      if (orderFilter === 'active') return o.orderStatus === 'new' || o.orderStatus === 'preparing';
      if (orderFilter === 'ready') return o.orderStatus === 'ready';
      if (orderFilter === 'done') return o.orderStatus === 'completed' || o.orderStatus === 'cancelled';
      return true;
    });
  }, [orders, orderFilter]);

  const getOrderDate = (ts: unknown): Date | null => {
    if (!ts) return null;
    if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
      return (ts as { toDate: () => Date }).toDate();
    }
    if (ts instanceof Date) return ts;
    return null;
  };

  const reportOrders = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return orders.filter((o) => {
      if (reportPaidOnly && (o.paymentStatus !== 'paid' || o.orderStatus === 'cancelled')) {
        return false;
      }
      if (reportPeriod === 'all') return true;
      const d = getOrderDate(o.createdAt);
      if (!d) return true;
      const ms = d.getTime();
      if (reportPeriod === 'today') return ms >= startOfToday;
      if (reportPeriod === '7d') return ms >= now.getTime() - 7 * 86400000;
      if (reportPeriod === '30d') return ms >= now.getTime() - 30 * 86400000;
      return true;
    });
  }, [orders, reportPeriod, reportPaidOnly]);

  const reportSummary = useMemo(() => {
    const valid = reportOrders.filter((o) => o.orderStatus !== 'cancelled');
    const paid = valid.filter((o) => o.paymentStatus === 'paid');
    const pending = valid.filter((o) => o.paymentStatus !== 'paid');
    const byMethod: Record<PaymentMethod, { count: number; total: number }> = {
      qris: { count: 0, total: 0 },
      va_bank: { count: 0, total: 0 },
      ewallet: { count: 0, total: 0 },
      cashier: { count: 0, total: 0 },
    };
    for (const o of paid) {
      byMethod[o.paymentMethod].count += 1;
      byMethod[o.paymentMethod].total += o.totalAmount;
    }
    return {
      totalCount: reportOrders.length,
      paidCount: paid.length,
      paidTotal: paid.reduce((s, o) => s + o.totalAmount, 0),
      pendingTotal: pending.reduce((s, o) => s + o.totalAmount, 0),
      taxTotal: paid.reduce((s, o) => s + o.taxAmount, 0),
      serviceTotal: paid.reduce((s, o) => s + o.serviceFee, 0),
      byMethod,
    };
  }, [reportOrders]);

  const handleDownloadCsvReport = () => {
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };
    const headers = [
      'Tanggal',
      'Kode Pesanan',
      'Meja / Layanan',
      'Pelanggan',
      'Rincian Item',
      'Metode Pembayaran',
      'Status Pembayaran',
      'Status Pesanan',
      'Subtotal (Rp)',
      'Pajak PB1 (Rp)',
      'Biaya Layanan (Rp)',
      'Total (Rp)',
    ];
    const rows = reportOrders.map((o) => [
      escapeCsv(formatTimestamp(o.createdAt)),
      escapeCsv(o.orderCode),
      escapeCsv(o.tableLabel),
      escapeCsv(o.customerAlias),
      escapeCsv(o.items.map((it) => `${it.qty}x ${it.name}`).join('; ')),
      escapeCsv(PAYMENT_METHOD_META[o.paymentMethod].shortLabel),
      escapeCsv(PAYMENT_STATUS_META[o.paymentStatus].label),
      escapeCsv(ORDER_STATUS_META[o.orderStatus].label),
      o.subtotal,
      o.taxAmount,
      o.serviceFee,
      o.totalAmount,
    ]);

    const summaryRows = [
      [],
      ['Ringkasan Pembukuan', storeConfig.storeName],
      ['Total Transaksi', reportSummary.totalCount],
      ['Total Omzet Lunas (Rp)', reportSummary.paidTotal],
      ['Total Pajak PB1 Lunas (Rp)', reportSummary.taxTotal],
      ['Total Biaya Layanan Lunas (Rp)', reportSummary.serviceTotal],
      ['Total Belum Lunas / Verifikasi (Rp)', reportSummary.pendingTotal],
    ];

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(',')), ...summaryRows.map((r) => r.join(','))].join(
        '\n'
      );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `laporan-transaksi-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify('Laporan transaksi CSV berhasil diunduh.');
  };

  const handleRevealContact = async (orderId: string) => {
    if (contactCache[orderId] !== undefined) return;
    setLoadingContactId(orderId);
    try {
      const contact = await getOrderPrivateContact(orderId);
      setContactCache((prev) => ({ ...prev, [orderId]: contact }));
    } catch {
      onNotify('Gagal memuat kontak pelanggan.');
    } finally {
      setLoadingContactId(null);
    }
  };

  const getCustomerShareUrl = (code: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/?table=${encodeURIComponent(code)}`;
  };

  const copyShareUrl = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onNotify(`Link ${label} berhasil disalin.`);
    } catch {
      onNotify(`Salin link: ${url}`);
    }
  };

  // QR Table CRUD handlers
  const openNewTable = () => {
    setEditingTable(null);
    setTCode('');
    setTLabel('');
    setTArea('Dine-In');
    setTActive(true);
    setTableFormOpen(true);
  };

  const openEditTable = (t: QrTable) => {
    setEditingTable(t);
    setTCode(t.code);
    setTLabel(t.label);
    setTArea(t.area);
    setTActive(t.isActive);
    setTableFormOpen(true);
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = tCode.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    if (cleanCode.length < 2) {
      onNotify('Kode parameter URL minimal 2 karakter.');
      return;
    }
    const cleanLabel = tLabel.trim() || cleanCode;
    if (cleanLabel.length < 2) {
      onNotify('Label tampilan pelanggan minimal 2 karakter.');
      return;
    }
    const tableObj: QrTable = {
      id: editingTable?.id || `tbl_${cleanCode.toLowerCase()}`,
      code: cleanCode,
      label: cleanLabel,
      area: tArea,
      isActive: tActive,
      createdAt: editingTable?.createdAt,
    };
    try {
      await adminSaveQrTable(tableObj, !editingTable);
      setTableFormOpen(false);
      onNotify(`Barcode ${tableObj.label} berhasil disimpan.`);
    } catch {
      onNotify('Gagal menyimpan barcode meja. Periksa kembali isian Anda.');
    }
  };

  // Menu CRUD handlers
  const openNewMenu = () => {
    setEditingMenu(null);
    setMName('');
    setMCategory('Coffee & Espresso');
    setMPrice(25000);
    setMPrep(5);
    setMDesc('');
    setMImage(CURATED_MENU_IMAGES[0].url);
    setMAvailable(true);
    setMFeatured(false);
    setMenuFormOpen(true);
  };

  const openEditMenu = (item: MenuItem) => {
    setEditingMenu(item);
    setMName(item.name);
    setMCategory(item.category);
    setMPrice(item.price);
    setMPrep(item.prepMinutes);
    setMDesc(item.description);
    setMImage(item.imageUrl);
    setMAvailable(item.isAvailable);
    setMFeatured(item.isFeatured);
    setMenuFormOpen(true);
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = mName.trim();
    const cleanDesc = mDesc.trim();
    if (cleanName.length < 2) {
      onNotify('Nama menu minimal 2 karakter.');
      return;
    }
    if (cleanDesc.length < 4) {
      onNotify('Deskripsi menu minimal 4 karakter.');
      return;
    }
    const item: MenuItem = {
      id: editingMenu?.id || `menu_${Date.now().toString(36)}`,
      name: cleanName,
      category: mCategory,
      description: cleanDesc,
      price: Number(mPrice) || 0,
      imageUrl: mImage.trim() || CURATED_MENU_IMAGES[0].url,
      isAvailable: mAvailable,
      isFeatured: mFeatured,
      prepMinutes: Number(mPrep) || 10,
      sortOrder: editingMenu?.sortOrder ?? menuItems.length + 1,
    };
    try {
      await adminSaveMenuItem(item);
      setMenuFormOpen(false);
      onNotify(`Menu "${item.name}" berhasil disimpan.`);
    } catch {
      onNotify('Gagal menyimpan menu. Periksa kembali isian Anda.');
    }
  };

  const togglePaymentMethod = (method: PaymentMethod) => {
    setCfgDraft((prev) => {
      const exists = prev.enabledPayments.includes(method);
      if (exists && prev.enabledPayments.length === 1) {
        onNotify('Minimal 1 metode pembayaran harus aktif.');
        return prev;
      }
      const next = exists
        ? prev.enabledPayments.filter((m) => m !== method)
        : [...prev.enabledPayments, method];
      return { ...prev, enabledPayments: next };
    });
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await adminSaveStoreConfig(cfgDraft);
      onNotify('Pengaturan toko & pembayaran terintegrasi disimpan.');
    } catch {
      onNotify('Gagal menyimpan pengaturan toko. Pastikan seluruh kolom valid.');
    } finally {
      setSavingConfig(false);
    }
  };

  const compressQrisImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Gagal membaca file gambar QRIS.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Format gambar tidak valid atau rusak.'));
        img.onload = () => {
          const maxDim = 680;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas browser tidak tersedia.'));
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          let dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          if (dataUrl.length > LIMITS.QRIS_IMAGE_MAX) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          }
          if (dataUrl.length > LIMITS.QRIS_IMAGE_MAX) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.55);
          }
          if (dataUrl.length > LIMITS.QRIS_IMAGE_MAX) {
            reject(new Error('Ukuran gambar masih terlalu besar setelah kompresi. Gunakan gambar lebih kecil.'));
            return;
          }
          resolve(dataUrl);
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleQrisFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setQrisUploadError('Pilih file gambar PNG, JPG, atau WebP.');
      return;
    }

    setQrisUploading(true);
    setQrisUploadError('');
    try {
      const compressedDataUrl = await compressQrisImage(file);
      const nextCfg: StoreConfig = { ...cfgDraft, qrisImageUrl: compressedDataUrl };
      setCfgDraft(nextCfg);
      await adminSaveStoreConfig(nextCfg);
      onNotify('Gambar QRIS pembayaran berhasil diunggah & langsung aktif untuk pelanggan.');
    } catch (err) {
      setQrisUploadError(err instanceof Error ? err.message : 'Gagal mengunggah gambar QRIS.');
    } finally {
      setQrisUploading(false);
    }
  };

  const handleResetQrisImage = async () => {
    setQrisUploading(true);
    setQrisUploadError('');
    try {
      const nextCfg: StoreConfig = { ...cfgDraft, qrisImageUrl: '' };
      setCfgDraft(nextCfg);
      await adminSaveStoreConfig(nextCfg);
      onNotify('QRIS dikembalikan ke mode QRIS Dinamis otomatis.');
    } catch {
      setQrisUploadError('Gagal mereset gambar QRIS. Coba ulangi.');
    } finally {
      setQrisUploading(false);
    }
  };

  // Auth Gate Render
  if (!authReady || checkingRole) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-zinc-500">Memverifikasi sesi Web Master...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white border border-zinc-200 rounded-2xl p-8 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-mono text-[#5C3A21] font-semibold">WEB MASTER PORTAL</p>
            <h1 className="text-2xl font-bold text-[#2B1D14]">Masuk ke Panel Pemilik UMKM</h1>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Kelola pesanan pelanggan secara real-time, verifikasi pembayaran QRIS/transfer, atur
              menu, dan cetak barcode meja QR untuk dibagikan ke pelanggan.
            </p>
          </div>

          {authError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 bg-[#0D7A6F] text-white text-sm font-semibold rounded-xl hover:bg-[#095E55] transition-colors flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            Masuk dengan Akun Google Pemilik
          </button>

          <button
            type="button"
            onClick={onBackToStorefront}
            className="w-full py-2.5 px-4 bg-zinc-100 text-zinc-700 text-xs font-medium rounded-xl hover:bg-zinc-200 transition-colors"
          >
            Kembali ke Etalase Pelanggan
          </button>
        </div>
      </div>
    );
  }

  if (!isAdminMember) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white border border-zinc-200 rounded-2xl p-8 space-y-5">
          <div className="flex items-center gap-3 text-amber-700">
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <h1 className="text-xl font-bold text-zinc-900">Akses Web Master Dibatasi</h1>
          </div>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Anda masuk sebagai <strong className="font-mono text-zinc-900">{user.email}</strong>.
            Panel Web Master hanya dapat diakses oleh akun pemilik UMKM yang terdaftar.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2.5 bg-zinc-900 text-white text-xs font-semibold rounded-xl hover:bg-zinc-800"
            >
              Ganti Akun Google
            </button>
            <button
              type="button"
              onClick={onBackToStorefront}
              className="px-4 py-2.5 bg-zinc-100 text-zinc-700 text-xs font-medium rounded-xl hover:bg-zinc-200"
            >
              Ke Etalase Pelanggan
            </button>
          </div>
        </div>
      </div>
    );
  }

  const needsSeed = !dbStatus.config || !dbStatus.menu || !dbStatus.tables;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Workspace Header */}
      <div className="no-print flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>Web Master</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-zinc-800">{storeConfig.storeName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{user.email}</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mt-1">
            Dashboard Operasional, Pembayaran & Barcode Pelanggan
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setReportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0D7A6F] rounded-lg hover:bg-[#095E55] transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Download Laporan
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-100 whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar
          </button>
        </div>
      </div>

      {/* First-Time Database Seed Prompt */}
      {needsSeed && (
        <div className="no-print bg-[#E5F4F2] border border-[#0D7A6F]/25 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#0D7A6F] flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Inisialisasi Data Awal UMKM ke Firestore
            </p>
            <p className="text-xs text-zinc-700">
              Simpan profil toko, 7 menu kopi &amp; pastry awal, serta 6 barcode meja QR ke database
              agar siap diedit dan menerima pesanan pelanggan.
            </p>
          </div>
          <button
            type="button"
            disabled={seeding}
            onClick={handleSeedData}
            className="px-4 py-2.5 bg-[#0D7A6F] text-white text-xs font-semibold rounded-xl hover:bg-[#095E55] whitespace-nowrap shrink-0"
          >
            {seeding ? 'Menyimpan...' : 'Simpan Data Awal ke Database'}
          </button>
        </div>
      )}

      {/* Navigation Layout: Sidebar + Content Viewport */}
      <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-3 bg-white border border-zinc-200 rounded-2xl p-2 space-y-1">
          {[
            { id: 'orders' as MasterTab, label: 'Pesanan & Kasir', icon: ClipboardList },
            { id: 'barcodes' as MasterTab, label: 'Barcode & Meja QR', icon: QrCode },
            { id: 'menu' as MasterTab, label: 'Kelola Menu', icon: UtensilsCrossed },
            { id: 'settings' as MasterTab, label: 'Pembayaran & Toko', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#5C3A21] text-white'
                    : 'text-zinc-700 hover:bg-[#F3ECE4]/70 hover:text-[#2B1D14]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  {tab.label}
                </span>
                {tab.id === 'orders' && orderStats.verifyingCount > 0 && (
                  <span
                    className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded ${
                      active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {orderStats.verifyingCount}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        <div className="lg:col-span-9 space-y-6">
          {/* TAB 1: ORDERS & CASHIER */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              {/* 4 KPI Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 bg-white border border-zinc-200 rounded-2xl divide-y md:divide-y-0 md:divide-x divide-zinc-200">
                <div className="p-4">
                  <p className="text-xs text-zinc-500">Total Pesanan</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-zinc-900 mt-1">
                    {orderStats.totalOrders}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-zinc-500">Perlu Verifikasi Bayar</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
                    {orderStats.verifyingCount}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-zinc-500">Antrean Dapur</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-zinc-900 mt-1">
                    {orderStats.activeKitchen}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-zinc-500">Omzet Lunas</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-[#0D7A6F] mt-1">
                    {formatRupiah(orderStats.paidRevenue)}
                  </p>
                </div>
              </div>

              {/* Filter Tabs + Quick Download Laporan Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {(
                    [
                      { key: 'all', label: 'Semua' },
                      { key: 'verifying', label: 'Belum / Verifikasi Bayar' },
                      { key: 'active', label: 'Masuk & Diproses' },
                      { key: 'ready', label: 'Siap Disajikan' },
                      { key: 'done', label: 'Selesai / Batal' },
                    ] as { key: OrderFilter; label: string }[]
                  ).map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setOrderFilter(f.key)}
                      className={`px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                        orderFilter === f.key
                          ? 'bg-[#5C3A21] text-white'
                          : 'bg-[#F3ECE4] text-zinc-700 hover:bg-[#e7ddd2]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setReportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0D7A6F] bg-[#E5F4F2] border border-[#0D7A6F]/25 rounded-lg hover:bg-[#d2ece9] transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Ringkasan Pembukuan (CSV / PDF)
                </button>
              </div>

              {/* Orders List */}
              {filteredOrders.length === 0 ? (
                <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center space-y-2">
                  <p className="text-base font-semibold text-zinc-900">Belum ada pesanan pada filter ini</p>
                  <p className="text-sm text-zinc-500">
                    Bagikan QR Barcode meja ke pelanggan untuk menerima pesanan masuk secara langsung.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map((ord) => {
                    const contact = contactCache[ord.id];
                    return (
                      <div
                        key={ord.id}
                        className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-zinc-100 pb-4">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                              <span className="font-mono font-bold text-zinc-900 text-sm">
                                {ord.orderCode}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{ord.tableLabel}</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatTimestamp(ord.createdAt)}</span>
                            </div>
                            <p className="text-sm font-semibold text-zinc-900">
                              Pemesan: {ord.customerAlias}
                            </p>
                            {ord.paymentRef && (
                              <p className="text-xs font-mono text-zinc-500">
                                Ref Bayar: {ord.paymentRef}
                              </p>
                            )}
                          </div>

                          <div className="sm:text-right space-y-1">
                            <p className="text-lg font-bold font-mono tabular-nums text-zinc-900">
                              {formatRupiah(ord.totalAmount)}
                            </p>
                            <p className="text-xs text-zinc-600">
                              {PAYMENT_METHOD_META[ord.paymentMethod].shortLabel} ·{' '}
                              <span
                                className={
                                  PAYMENT_STATUS_META[ord.paymentStatus].tone === 'emerald'
                                    ? 'text-emerald-700 font-semibold'
                                    : PAYMENT_STATUS_META[ord.paymentStatus].tone === 'amber'
                                      ? 'text-amber-700 font-semibold'
                                      : 'text-red-700 font-semibold'
                                }
                              >
                                {PAYMENT_STATUS_META[ord.paymentStatus].label}
                              </span>
                            </p>
                            <p className="text-xs font-semibold text-zinc-800">
                              Dapur: {ORDER_STATUS_META[ord.orderStatus].label}
                            </p>
                          </div>
                        </div>

                        {/* Items */}
                        <div className="space-y-1 text-sm">
                          {ord.items.map((it, idx) => (
                            <div key={`${it.menuItemId}-${idx}`} className="flex justify-between gap-4">
                              <span className="text-zinc-800">
                                <span className="font-mono tabular-nums font-medium">{it.qty}×</span>{' '}
                                {it.name}
                                {it.note ? (
                                  <span className="text-xs text-zinc-500"> ({it.note})</span>
                                ) : null}
                              </span>
                              <span className="font-mono tabular-nums text-zinc-600">
                                {formatRupiah(it.price * it.qty)}
                              </span>
                            </div>
                          ))}
                          {ord.notes && (
                            <p className="text-xs text-zinc-500 pt-1">Catatan: {ord.notes}</p>
                          )}
                        </div>

                        {/* Isolated PII Contact Panel */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-100">
                          <div className="text-xs">
                            {contact ? (
                              <span className="inline-flex items-center gap-2 text-zinc-700 font-mono">
                                <Phone className="w-3.5 h-3.5 text-[#5C3A21]" />
                                {contact.customerPhone}
                                {contact.deliveryAddress ? ` · ${contact.deliveryAddress}` : ''}
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={loadingContactId === ord.id}
                                onClick={() => handleRevealContact(ord.id)}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5C3A21] hover:underline"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                {loadingContactId === ord.id
                                  ? 'Memuat kontak...'
                                  : 'Tampilkan No. WA & Alamat'}
                              </button>
                            )}
                          </div>

                          {/* Cashier / Kitchen Operational Actions */}
                          <div className="flex flex-wrap items-center gap-2">
                            {ord.paymentStatus !== 'paid' && ord.orderStatus !== 'cancelled' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await adminUpdateOrderStatus(ord.id, ord.orderCode, {
                                      paymentStatus: 'paid',
                                    });
                                    onNotify(`${ord.orderCode} ditandai Lunas.`);
                                  } catch {
                                    onNotify(`Gagal memperbarui status bayar ${ord.orderCode}.`);
                                  }
                                }}
                                className="px-3 py-1.5 bg-[#0D7A6F] text-white text-xs font-semibold rounded-lg hover:bg-[#095E55] whitespace-nowrap"
                              >
                                Konfirmasi Lunas
                              </button>
                            )}

                            {ord.orderStatus === 'new' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await adminUpdateOrderStatus(ord.id, ord.orderCode, {
                                      orderStatus: 'preparing',
                                    });
                                  } catch {
                                    onNotify(`Gagal memperbarui status ${ord.orderCode}.`);
                                  }
                                }}
                                className="px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 whitespace-nowrap"
                              >
                                Proses Dapur
                              </button>
                            )}

                            {ord.orderStatus === 'preparing' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await adminUpdateOrderStatus(ord.id, ord.orderCode, {
                                      orderStatus: 'ready',
                                    });
                                  } catch {
                                    onNotify(`Gagal memperbarui status ${ord.orderCode}.`);
                                  }
                                }}
                                className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 whitespace-nowrap"
                              >
                                Siap Disajikan
                              </button>
                            )}

                            {ord.orderStatus === 'ready' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await adminUpdateOrderStatus(ord.id, ord.orderCode, {
                                      orderStatus: 'completed',
                                    });
                                  } catch {
                                    onNotify(`Gagal menyelesaikan ${ord.orderCode}.`);
                                  }
                                }}
                                className="px-3 py-1.5 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 whitespace-nowrap"
                              >
                                Tandai Selesai
                              </button>
                            )}

                            {ord.orderStatus !== 'completed' && ord.orderStatus !== 'cancelled' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await adminUpdateOrderStatus(ord.id, ord.orderCode, {
                                      orderStatus: 'cancelled' as OrderStatus,
                                    });
                                  } catch {
                                    onNotify(`Gagal membatalkan ${ord.orderCode}.`);
                                  }
                                }}
                                className="px-3 py-1.5 bg-zinc-100 text-red-700 text-xs font-medium rounded-lg hover:bg-red-50 whitespace-nowrap"
                              >
                                Batalkan
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: QR BARCODE GENERATOR & SHARE HUB */}
          {activeTab === 'barcodes' && (
            <div className="space-y-6">
              <div className="bg-white border border-zinc-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-zinc-900">
                    Generator Barcode QR Meja & Link Pelanggan
                  </h2>
                  <p className="text-sm text-zinc-600 mt-1">
                    Buat QR Code per meja atau kanal pemesanan, cetak sebagai kartu meja, atau
                    bagikan link langsung ke WhatsApp & media sosial pelanggan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openNewTable}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#0D7A6F] text-white text-xs font-semibold rounded-xl hover:bg-[#095E55] whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Barcode Baru
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {qrTables.map((tbl) => {
                  const shareUrl = getCustomerShareUrl(tbl.code);
                  const waShareHref = `https://wa.me/?text=${encodeURIComponent(
                    `Pesan makanan & minuman ${storeConfig.storeName} (${tbl.label}) langsung dari sini: ${shareUrl}`
                  )}`;
                  return (
                    <div
                      key={tbl.id}
                      className="bg-white border border-zinc-200 rounded-2xl p-5 flex flex-col justify-between gap-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <span>{tbl.area}</span>
                            <span aria-hidden="true">·</span>
                            <span className={tbl.isActive ? 'text-emerald-700 font-medium' : 'text-zinc-400'}>
                              {tbl.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-zinc-900 truncate">{tbl.label}</h3>
                          <p className="text-xs font-mono text-zinc-500 truncate">{shareUrl}</p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            aria-label={`Edit ${tbl.label}`}
                            onClick={() => openEditTable(tbl)}
                            className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Hapus ${tbl.label}`}
                            onClick={async () => {
                              try {
                                await adminDeleteQrTable(tbl.id);
                                onNotify(`Barcode ${tbl.label} dihapus.`);
                              } catch {
                                onNotify(`Gagal menghapus barcode ${tbl.label}.`);
                              }
                            }}
                            className="p-2 text-zinc-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-5">
                        <QrCodeCanvas
                          value={shareUrl}
                          size={140}
                          downloadName={`QR-${tbl.code}.png`}
                          showDownload
                        />

                        <div className="flex-1 w-full space-y-2">
                          <button
                            type="button"
                            onClick={() => copyShareUrl(shareUrl, tbl.label)}
                            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Salin Link Pelanggan
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrintTable(tbl)}
                            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Cetak Kartu Meja QR
                          </button>

                          <a
                            href={waShareHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-[#E5F4F2] hover:bg-[#d2ece9] text-[#0D7A6F] rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Bagikan via WhatsApp
                          </a>

                          <button
                            type="button"
                            onClick={() => onPreviewTableLink(tbl.code)}
                            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium border border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded-lg transition-colors"
                          >
                            Uji Tampilan Pelanggan
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: MENU CRUD */}
          {activeTab === 'menu' && (
            <div className="space-y-6">
              <div className="bg-white border border-zinc-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-zinc-900">Kelola Daftar Menu UMKM</h2>
                  <p className="text-sm text-zinc-600 mt-1">
                    Tambah hidangan baru, ubah harga, atau tandai stok habis secara instan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openNewMenu}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#0D7A6F] text-white text-xs font-semibold rounded-xl hover:bg-[#095E55] whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Menu Baru
                </button>
              </div>

              <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-500">
                        <th className="py-3 px-4">Menu</th>
                        <th className="py-3 px-4">Kategori</th>
                        <th className="py-3 px-4 text-right">Harga</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-sm">
                      {menuItems.map((item) => (
                        <tr key={item.id} className="hover:bg-zinc-50/70">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                referrerPolicy="no-referrer"
                                className="w-11 h-11 rounded-lg object-cover bg-zinc-100 shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-zinc-900 truncate max-w-[220px]">
                                  {item.name}
                                </p>
                                <p className="text-xs text-zinc-500 tabular-nums">
                                  Estimasi {item.prepMinutes} mnt
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-zinc-600 whitespace-nowrap">
                            {item.category}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-zinc-900 whitespace-nowrap">
                            {formatRupiah(item.price)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await adminSaveMenuItem({ ...item, isAvailable: !item.isAvailable });
                                  onNotify(
                                    `${item.name} ditandai ${!item.isAvailable ? 'Tersedia' : 'Habis'}.`
                                  );
                                } catch {
                                  onNotify(`Gagal memperbarui stok ${item.name}.`);
                                }
                              }}
                              className={`text-xs font-medium px-2.5 py-1 rounded-md border ${
                                item.isAvailable
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-zinc-200 bg-zinc-100 text-zinc-600'
                              }`}
                            >
                              {item.isAvailable ? 'Tersedia' : 'Habis'}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditMenu(item)}
                                className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await adminDeleteMenuItem(item.id);
                                    onNotify(`Menu "${item.name}" dihapus.`);
                                  } catch {
                                    onNotify(`Gagal menghapus menu "${item.name}".`);
                                  }
                                }}
                                className="p-2 text-zinc-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: INTEGRATED PAYMENT & STORE SETTINGS */}
          {activeTab === 'settings' && (
            <form onSubmit={handleSaveConfig} className="space-y-6">
              <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5">
                <div className="border-b border-zinc-100 pb-4">
                  <h2 className="text-lg font-bold text-zinc-900">Profil Toko UMKM</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Informasi yang tampil di etalase pemesanan pelanggan dan struk digital.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Nama Toko / Usaha
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={LIMITS.STORE_NAME_MAX}
                      value={cfgDraft.storeName}
                      onChange={(e) => setCfgDraft({ ...cfgDraft, storeName: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      No. WhatsApp Outlet
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={20}
                      value={cfgDraft.whatsappNumber}
                      onChange={(e) => setCfgDraft({ ...cfgDraft, whatsappNumber: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Tagline</label>
                  <input
                    type="text"
                    required
                    maxLength={LIMITS.TAGLINE_MAX}
                    value={cfgDraft.tagline}
                    onChange={(e) => setCfgDraft({ ...cfgDraft, tagline: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Alamat Outlet</label>
                  <input
                    type="text"
                    required
                    maxLength={LIMITS.ADDRESS_MAX}
                    value={cfgDraft.address}
                    onChange={(e) => setCfgDraft({ ...cfgDraft, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Pajak PB1 (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={25}
                      value={cfgDraft.taxPercent}
                      onChange={(e) =>
                        setCfgDraft({ ...cfgDraft, taxPercent: Number(e.target.value) })
                      }
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-zinc-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Biaya Layanan (Rp)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={50000}
                      step={500}
                      value={cfgDraft.serviceFee}
                      onChange={(e) =>
                        setCfgDraft({ ...cfgDraft, serviceFee: Number(e.target.value) })
                      }
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-zinc-200 rounded-xl"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2.5 px-4 py-2.5 border border-zinc-200 rounded-xl w-full cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cfgDraft.isOpen}
                        onChange={(e) => setCfgDraft({ ...cfgDraft, isOpen: e.target.checked })}
                        className="accent-[#0D7A6F]"
                      />
                      <span className="text-sm font-medium text-zinc-800">Toko Sedang Buka</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5">
                <div className="border-b border-zinc-100 pb-4 flex items-center gap-2.5">
                  <CreditCard className="w-5 h-5 text-[#5C3A21]" />
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900">
                      Sistem Pembayaran Terintegrasi
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Aktifkan kanal pembayaran dan atur detail rekening penerima UMKM Anda.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['qris', 'va_bank', 'ewallet', 'cashier'] as PaymentMethod[]).map((m) => {
                    const active = cfgDraft.enabledPayments.includes(m);
                    return (
                      <label
                        key={m}
                        className={`flex items-center gap-3 p-3.5 border rounded-xl cursor-pointer ${
                          active ? 'border-[#0D7A6F] bg-[#E5F4F2]/50' : 'border-zinc-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => togglePaymentMethod(m)}
                          className="accent-[#0D7A6F]"
                        />
                        <span className="text-sm font-medium text-zinc-900">
                          {PAYMENT_METHOD_META[m].shortLabel}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Nama Merchant QRIS
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={cfgDraft.qrisMerchantName}
                      onChange={(e) =>
                        setCfgDraft({ ...cfgDraft, qrisMerchantName: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      NMID QRIS
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={40}
                      value={cfgDraft.qrisNmid}
                      onChange={(e) => setCfgDraft({ ...cfgDraft, qrisNmid: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-zinc-200 rounded-xl"
                    />
                  </div>
                </div>

                {/* Upload & Ganti Gambar QRIS Pembayaran */}
                <div className="border border-zinc-200 rounded-2xl p-5 bg-zinc-50/70 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">
                        Upload Gambar Kode QRIS Toko
                      </h3>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        Unggah gambar QRIS resmi (GoPay Merchant, BCA, BRI, DANA Bisnis, dll.)
                        untuk mengganti QRIS pembayaran yang tampil saat pelanggan checkout.
                      </p>
                    </div>
                    {cfgDraft.qrisImageUrl && (
                      <button
                        type="button"
                        disabled={qrisUploading}
                        onClick={handleResetQrisImage}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-100 whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Pakai QRIS Otomatis
                      </button>
                    )}
                  </div>

                  {qrisUploadError && (
                    <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                      {qrisUploadError}
                    </p>
                  )}

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    <div className="w-40 h-44 bg-white border border-zinc-200 rounded-xl flex items-center justify-center p-2 shrink-0 overflow-hidden">
                      {cfgDraft.qrisImageUrl ? (
                        <img
                          src={cfgDraft.qrisImageUrl}
                          alt="Pratinjau QRIS Pembayaran"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain rounded-md"
                        />
                      ) : (
                        <div className="text-center space-y-2 px-2">
                          <ImageIcon className="w-7 h-7 text-zinc-300 mx-auto" />
                          <p className="text-[11px] text-zinc-500 leading-snug">
                            Menggunakan QRIS Dinamis otomatis dari NMID
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 w-full space-y-3">
                      <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0D7A6F] text-white text-xs font-semibold rounded-xl hover:bg-[#095E55] transition-colors cursor-pointer whitespace-nowrap">
                        <Upload className="w-4 h-4" />
                        <span>
                          {qrisUploading
                            ? 'Memproses & Menyimpan...'
                            : cfgDraft.qrisImageUrl
                              ? 'Ganti Gambar QRIS (PNG/JPG)'
                              : 'Upload Gambar QRIS (PNG/JPG)'}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={qrisUploading}
                          onChange={handleQrisFileChange}
                          className="sr-only"
                        />
                      </label>

                      <div>
                        <label className="block text-[11px] font-medium text-zinc-600 mb-1">
                          Atau tempel URL gambar QRIS eksternal (opsional)
                        </label>
                        <input
                          type="text"
                          maxLength={LIMITS.QRIS_IMAGE_MAX}
                          value={
                            cfgDraft.qrisImageUrl?.startsWith('data:')
                              ? ''
                              : cfgDraft.qrisImageUrl || ''
                          }
                          onChange={(e) =>
                            setCfgDraft({ ...cfgDraft, qrisImageUrl: e.target.value })
                          }
                          placeholder={
                            cfgDraft.qrisImageUrl?.startsWith('data:')
                              ? 'Gambar QRIS terunggah tersimpan di database'
                              : 'https://...'
                          }
                          className="w-full px-3 py-2 text-xs font-mono bg-white border border-zinc-200 rounded-lg"
                        />
                      </div>

                      {cfgDraft.qrisImageUrl && (
                        <div className="flex items-center gap-3 text-xs text-zinc-600">
                          <span className="text-emerald-700 font-medium">
                            QRIS Kustom Aktif
                          </span>
                          <span aria-hidden="true">·</span>
                          <a
                            href={cfgDraft.qrisImageUrl}
                            download="QRIS-Toko.jpg"
                            className="inline-flex items-center gap-1 text-zinc-700 hover:text-zinc-900 underline"
                          >
                            <Download className="w-3 h-3" />
                            Unduh Salinan
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Nama Bank</label>
                    <input
                      type="text"
                      required
                      maxLength={40}
                      value={cfgDraft.bankName}
                      onChange={(e) => setCfgDraft({ ...cfgDraft, bankName: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      No. Rekening / VA
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={30}
                      value={cfgDraft.bankAccountNumber}
                      onChange={(e) =>
                        setCfgDraft({ ...cfgDraft, bankAccountNumber: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-zinc-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Atas Nama Rekening
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={cfgDraft.bankAccountHolder}
                      onChange={(e) =>
                        setCfgDraft({ ...cfgDraft, bankAccountHolder: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Label & Nomor E-Wallet
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={cfgDraft.ewalletLabel}
                    onChange={(e) => setCfgDraft({ ...cfgDraft, ewalletLabel: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-[#0D7A6F] text-white text-sm font-semibold rounded-xl hover:bg-[#095E55] transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {savingConfig ? 'Menyimpan...' : 'Simpan Pengaturan Toko'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Modal: Create / Edit QR Table Barcode */}
      {tableFormOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900">
                {editingTable ? 'Edit Barcode Meja' : 'Buat Barcode QR Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setTableFormOpen(false)}
                className="p-1.5 text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTable} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Kode Parameter URL (Tanpa Spasi)
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.TABLE_CODE_MAX}
                  value={tCode}
                  onChange={(e) => setTCode(e.target.value)}
                  placeholder="Contoh: Meja-05 atau Booth-A"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-zinc-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Label Tampilan Pelanggan
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.TABLE_LABEL_MAX}
                  value={tLabel}
                  onChange={(e) => setTLabel(e.target.value)}
                  placeholder="Contoh: Meja 05 (Lantai 2)"
                  className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Area Layanan</label>
                <select
                  value={tArea}
                  onChange={(e) => setTArea(e.target.value as TableArea)}
                  className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                >
                  <option value="Dine-In">Dine-In (Makan di Tempat)</option>
                  <option value="Takeaway">Takeaway (Bawa Pulang)</option>
                  <option value="Delivery">Delivery (Pesan Antar)</option>
                  <option value="Event">Event / Booth</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={tActive}
                  onChange={(e) => setTActive(e.target.checked)}
                  className="accent-[#0D7A6F]"
                />
                Barcode aktif menerima pesanan
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTableFormOpen(false)}
                  className="px-4 py-2 text-xs font-medium bg-zinc-100 text-zinc-700 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#0D7A6F] text-white rounded-xl hover:bg-[#095E55]"
                >
                  Simpan Barcode
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Print QR Tent Card */}
      {printTable && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl max-w-md w-full p-8 text-center space-y-5">
            <div className="no-print flex justify-end">
              <button
                type="button"
                onClick={() => setPrintTable(null)}
                className="p-1.5 text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border-2 border-zinc-900 rounded-2xl p-6 space-y-4">
              <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
                {storeConfig.storeName}
              </p>
              <h3 className="text-2xl font-bold text-zinc-900">{printTable.label}</h3>
              <p className="text-xs text-zinc-600">
                Scan barcode di bawah dengan kamera HP untuk melihat menu, memesan, dan bayar
                langsung dari meja Anda.
              </p>
              <div className="py-2">
                <QrCodeCanvas
                  value={getCustomerShareUrl(printTable.code)}
                  size={210}
                  caption={printTable.code}
                />
              </div>
              <p className="text-xs text-zinc-500">
                Menerima QRIS · Transfer Bank · E-Wallet · Kasir
              </p>
            </div>

            <div className="no-print flex gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-[#0D7A6F] text-white text-sm font-semibold rounded-xl hover:bg-[#095E55]"
              >
                <Printer className="w-4 h-4" />
                Cetak Kartu Meja
              </button>
              <button
                type="button"
                onClick={() => setPrintTable(null)}
                className="px-4 py-2.5 bg-zinc-100 text-zinc-700 text-sm font-medium rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Menu Item */}
      {menuFormOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900">
                {editingMenu ? 'Edit Menu' : 'Tambah Menu Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setMenuFormOpen(false)}
                className="p-1.5 text-zinc-500 hover:text-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMenu} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Nama Menu *</label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.MENU_NAME_MAX}
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Kategori</label>
                  <select
                    value={mCategory}
                    onChange={(e) => setMCategory(e.target.value as MenuCategory)}
                    className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-xl"
                  >
                    <optgroup label="Minuman">
                      <option value="Coffee & Espresso">Coffee &amp; Espresso</option>
                      <option value="Non-Coffee">Non-Coffee</option>
                      <option value="Minuman">Minuman Lainnya</option>
                    </optgroup>
                    <optgroup label="Makanan & Camilan">
                      <option value="Pastry & Makanan">Pastry &amp; Makanan</option>
                      <option value="Makanan Berat">Makanan Berat</option>
                      <option value="Camilan">Camilan</option>
                    </optgroup>
                    <optgroup label="Paket">
                      <option value="Paket Ngopi">Paket Ngopi</option>
                      <option value="Paket Hemat">Paket Hemat</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Harga (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    required
                    value={mPrice}
                    onChange={(e) => setMPrice(Number(e.target.value))}
                    className="w-full px-3 py-2.5 text-sm font-mono border border-zinc-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Waktu Saji (mnt)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    required
                    value={mPrep}
                    onChange={(e) => setMPrep(Number(e.target.value))}
                    className="w-full px-3 py-2.5 text-sm font-mono border border-zinc-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Deskripsi *</label>
                <textarea
                  rows={2}
                  required
                  maxLength={LIMITS.MENU_DESC_MAX}
                  value={mDesc}
                  onChange={(e) => setMDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Pilih Foto Kuliner atau URL Gambar
                </label>
                <select
                  value={
                    CURATED_MENU_IMAGES.some((img) => img.url === mImage) ? mImage : '__custom__'
                  }
                  onChange={(e) => {
                    if (e.target.value !== '__custom__') setMImage(e.target.value);
                  }}
                  className="w-full px-3.5 py-2 text-sm border border-zinc-200 rounded-xl mb-2"
                >
                  {CURATED_MENU_IMAGES.map((img) => (
                    <option key={img.url} value={img.url}>
                      {img.label}
                    </option>
                  ))}
                  <option value="__custom__">Gunakan URL Gambar Kustom</option>
                </select>
                <input
                  type="text"
                  required
                  maxLength={500}
                  value={mImage}
                  onChange={(e) => setMImage(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono border border-zinc-200 rounded-xl"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={mAvailable}
                    onChange={(e) => setMAvailable(e.target.checked)}
                    className="accent-[#0D7A6F]"
                  />
                  Stok Tersedia
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={mFeatured}
                    onChange={(e) => setMFeatured(e.target.checked)}
                    className="accent-[#0D7A6F]"
                  />
                  Menu Favorit
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMenuFormOpen(false)}
                  className="px-4 py-2 text-xs font-medium bg-zinc-100 text-zinc-700 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#0D7A6F] text-white rounded-xl hover:bg-[#095E55]"
                >
                  Simpan Menu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Bookkeeping Transaction Report (Tabel CSV & PDF Print) */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto print:static print:bg-white print:p-0">
          <div className="print-report-container bg-white border border-zinc-200 rounded-2xl max-w-5xl w-full p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-zinc-200 pb-5">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-[#5C3A21] font-semibold">
                  Laporan Pembukuan Transaksi UMKM
                </p>
                <h3 className="text-2xl font-bold text-zinc-900 mt-0.5">
                  {storeConfig.storeName}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {storeConfig.address} · Dicetak {new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}
                </p>
              </div>

              <div className="no-print flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadCsvReport}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#5C3A21] text-white text-xs font-semibold rounded-xl hover:bg-[#472B17] whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Download Tabel (CSV)
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0D7A6F] text-white text-xs font-semibold rounded-xl hover:bg-[#095E55] whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Simpan / Cetak PDF
                </button>
                <button
                  type="button"
                  aria-label="Tutup laporan"
                  onClick={() => setReportModalOpen(false)}
                  className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Report Filters */}
            <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-[#FAF7F2] border border-zinc-200 rounded-xl p-3.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: 'all', label: 'Semua Periode' },
                    { key: 'today', label: 'Hari Ini' },
                    { key: '7d', label: '7 Hari' },
                    { key: '30d', label: '30 Hari' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setReportPeriod(p.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      reportPeriod === p.key
                        ? 'bg-[#5C3A21] text-white'
                        : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reportPaidOnly}
                  onChange={(e) => setReportPaidOnly(e.target.checked)}
                  className="accent-[#0D7A6F]"
                />
                Hanya tampilkan transaksi Lunas
              </label>
            </div>

            {/* Accounting Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 border border-zinc-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-zinc-200">
              <div className="p-4">
                <p className="text-xs text-zinc-500">Jumlah Transaksi</p>
                <p className="text-xl font-bold font-mono tabular-nums text-zinc-900 mt-1">
                  {reportSummary.totalCount} ({reportSummary.paidCount} lunas)
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-zinc-500">Total Omzet Lunas</p>
                <p className="text-xl font-bold font-mono tabular-nums text-[#0D7A6F] mt-1">
                  {formatRupiah(reportSummary.paidTotal)}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-zinc-500">Pajak PB1 & Layanan (Lunas)</p>
                <p className="text-base font-bold font-mono tabular-nums text-zinc-900 mt-1">
                  {formatRupiah(reportSummary.taxTotal + reportSummary.serviceTotal)}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-zinc-500">Menunggu Bayar / Verifikasi</p>
                <p className="text-base font-bold font-mono tabular-nums text-amber-700 mt-1">
                  {formatRupiah(reportSummary.pendingTotal)}
                </p>
              </div>
            </div>

            {/* Payment Method Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {(['qris', 'va_bank', 'ewallet', 'cashier'] as PaymentMethod[]).map((m) => (
                <div key={m} className="border border-zinc-200 rounded-xl p-3 bg-zinc-50/60">
                  <p className="text-zinc-500">{PAYMENT_METHOD_META[m].shortLabel} (Lunas)</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-zinc-900 mt-1">
                    {formatRupiah(reportSummary.byMethod[m].total)}
                  </p>
                  <p className="text-[11px] text-zinc-500 font-mono tabular-nums">
                    {reportSummary.byMethod[m].count} transaksi
                  </p>
                </div>
              ))}
            </div>

            {/* Bookkeeping Transactions Table */}
            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold">
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3">Kode</th>
                      <th className="py-2.5 px-3">Meja / Pemesan</th>
                      <th className="py-2.5 px-3">Item Menu</th>
                      <th className="py-2.5 px-3">Metode</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {reportOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-zinc-500">
                          Belum ada transaksi pada rentang filter ini.
                        </td>
                      </tr>
                    ) : (
                      reportOrders.map((o) => (
                        <tr key={o.id}>
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-zinc-600">
                            {formatTimestamp(o.createdAt)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono font-semibold text-zinc-900">
                            {o.orderCode}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-medium text-zinc-900">{o.customerAlias}</span>
                            <span className="block text-[11px] text-zinc-500">{o.tableLabel}</span>
                          </td>
                          <td className="py-2.5 px-3 text-zinc-700 max-w-[240px]">
                            {o.items.map((it) => `${it.qty}x ${it.name}`).join(', ')}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-zinc-700">
                            {PAYMENT_METHOD_META[o.paymentMethod].shortLabel}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={
                                o.paymentStatus === 'paid'
                                  ? 'text-emerald-700 font-semibold'
                                  : o.paymentStatus === 'verifying'
                                    ? 'text-amber-700 font-semibold'
                                    : 'text-red-700 font-semibold'
                              }
                            >
                              {PAYMENT_STATUS_META[o.paymentStatus].label}
                            </span>
                            <span className="block text-[11px] text-zinc-500">
                              {ORDER_STATUS_META[o.orderStatus].label}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-zinc-900 whitespace-nowrap">
                            {formatRupiah(o.totalAmount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
