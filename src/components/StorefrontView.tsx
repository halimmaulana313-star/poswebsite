import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Coffee,
  Minus,
  Plus,
  QrCode,
  Search,
  X,
} from 'lucide-react';
import { HERO_IMAGE_URL } from '../data/defaults';
import {
  CartItem,
  formatRupiah,
  LIMITS,
  MenuCategory,
  MenuItem,
  QrTable,
  StoreConfig,
} from '../types';

interface StorefrontViewProps {
  storeConfig: StoreConfig;
  menuItems: MenuItem[];
  qrTables: QrTable[];
  selectedTableCode: string;
  onSelectTableCode: (code: string) => void;
  cart: CartItem[];
  onAddToCart: (item: MenuItem, qty: number, note: string) => void;
  onUpdateCartQty: (menuItemId: string, delta: number) => void;
  onOpenCart: () => void;
}

type MenuGroupId = 'Semua' | 'Minuman' | 'Makanan' | 'Camilan' | 'Paket';

interface MenuGroupDef {
  id: Exclude<MenuGroupId, 'Semua'>;
  label: string;
  subtitle: string;
  categories: MenuCategory[];
}

const MENU_GROUPS: MenuGroupDef[] = [
  {
    id: 'Minuman',
    label: 'Minuman',
    subtitle: 'Seduhan espresso, manual brew single origin, matcha, dan racikan non-kopi.',
    categories: ['Coffee & Espresso', 'Non-Coffee', 'Minuman'],
  },
  {
    id: 'Makanan',
    label: 'Makanan',
    subtitle: 'Pastry panggang harian dan hidangan utama pendamping kopi.',
    categories: ['Pastry & Makanan', 'Makanan Berat'],
  },
  {
    id: 'Camilan',
    label: 'Camilan',
    subtitle: 'Kudapan hangat dan teman ngopi santai sepanjang hari.',
    categories: ['Camilan'],
  },
  {
    id: 'Paket',
    label: 'Paket',
    subtitle: 'Pilihan bundling hemat kopi dan pastry untuk sendiri maupun berbagi.',
    categories: ['Paket Ngopi', 'Paket Hemat'],
  },
];

function getMenuGroupForCategory(category: MenuCategory): Exclude<MenuGroupId, 'Semua'> {
  const found = MENU_GROUPS.find((g) => g.categories.includes(category));
  return found ? found.id : 'Makanan';
}

const MenuImage: React.FC<{ src: string; alt: string; className?: string }> = ({
  src,
  alt,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#F3ECE4] text-[#5C3A21]/60 p-4 text-center ${className}`}
      >
        <Coffee className="w-7 h-7 mb-2 text-[#5C3A21]/50" />
        <span className="text-xs font-medium text-[#5C3A21]/80 line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

interface MenuCardProps {
  item: MenuItem;
  qtyInCart: number;
  storeIsOpen: boolean;
  onOpenDetail: (item: MenuItem) => void;
  onAddToCart: (item: MenuItem, qty: number, note: string) => void;
  onUpdateCartQty: (menuItemId: string, delta: number) => void;
}

const MenuCard: React.FC<MenuCardProps> = ({
  item,
  qtyInCart,
  storeIsOpen,
  onOpenDetail,
  onAddToCart,
  onUpdateCartQty,
}) => (
  <article className="group bg-white border border-stone-200 rounded-2xl overflow-hidden flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5">
    <div>
      <button
        type="button"
        onClick={() => onOpenDetail(item)}
        className="w-full text-left block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D7A6F]"
      >
        <div className="aspect-[4/3] w-full bg-[#F3ECE4] overflow-hidden relative">
          <MenuImage
            src={item.imageUrl}
            alt={item.name}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02] ${
              !item.isAvailable ? 'grayscale opacity-60' : ''
            }`}
          />
          {!item.isAvailable && (
            <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
              <span className="px-3 py-1 bg-white text-stone-900 text-xs font-semibold rounded-md">
                Sold Out
              </span>
            </div>
          )}
        </div>

        <div className="p-5 pb-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <span className="uppercase tracking-wider font-medium text-stone-500">
              {item.category}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="w-3 h-3" />
              {item.prepMinutes} mnt
            </span>
            {item.isFeatured && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#0D7A6F] font-semibold">Barista Pick</span>
              </>
            )}
          </div>

          <h4 className="text-base font-semibold text-[#2B1D14] leading-snug">{item.name}</h4>

          <p className="text-sm text-stone-600 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        </div>
      </button>
    </div>

    <div className="px-5 pb-5 pt-3 flex items-center justify-between gap-3 border-t border-stone-100">
      <span className="text-base font-bold text-[#5C3A21] tabular-nums font-mono">
        {formatRupiah(item.price)}
      </span>

      {!item.isAvailable || !storeIsOpen ? (
        <span className="text-xs font-medium text-stone-400">
          {!storeIsOpen ? 'Tutup' : 'Habis'}
        </span>
      ) : qtyInCart > 0 ? (
        <div className="inline-flex items-center gap-2 bg-[#F3ECE4] rounded-lg p-1">
          <button
            type="button"
            aria-label={`Kurangi ${item.name}`}
            onClick={() => onUpdateCartQty(item.id, -1)}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-stone-200 text-[#5C3A21] hover:bg-stone-50 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-semibold tabular-nums text-[#2B1D14]">
            {qtyInCart}
          </span>
          <button
            type="button"
            aria-label={`Tambah ${item.name}`}
            onClick={() => onAddToCart(item, 1, '')}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-[#0D7A6F] text-white hover:bg-[#095E55] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onAddToCart(item, 1, '')}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0D7A6F] text-white text-xs font-semibold rounded-lg hover:bg-[#095E55] transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Pesan
        </button>
      )}
    </div>
  </article>
);

export const StorefrontView: React.FC<StorefrontViewProps> = ({
  storeConfig,
  menuItems,
  qrTables,
  selectedTableCode,
  onSelectTableCode,
  cart,
  onAddToCart,
  onUpdateCartQty,
  onOpenCart,
}) => {
  const [activeGroup, setActiveGroup] = useState<MenuGroupId>('Semua');
  const [activeSubCategory, setActiveSubCategory] = useState<'Semua' | MenuCategory>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const [detailNote, setDetailNote] = useState('');

  const groupCounts = useMemo(() => {
    const counts: Record<MenuGroupId, number> = {
      Semua: menuItems.length,
      Minuman: 0,
      Makanan: 0,
      Camilan: 0,
      Paket: 0,
    };
    menuItems.forEach((item) => {
      const grp = getMenuGroupForCategory(item.category);
      counts[grp] += 1;
    });
    return counts;
  }, [menuItems]);

  const visibleGroups = useMemo(
    () => MENU_GROUPS.filter((g) => groupCounts[g.id] > 0),
    [groupCounts]
  );

  const subCategoriesForActiveGroup = useMemo(() => {
    if (activeGroup === 'Semua') return [];
    const present = Array.from(
      new Set(
        menuItems
          .filter((item) => getMenuGroupForCategory(item.category) === activeGroup)
          .map((item) => item.category)
      )
    );
    return present.length > 1 ? present : [];
  }, [menuItems, activeGroup]);

  const activeTable = useMemo(
    () => qrTables.find((t) => t.code.toLowerCase() === selectedTableCode.toLowerCase()),
    [qrTables, selectedTableCode]
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return menuItems.filter((item) => {
      const itemGroup = getMenuGroupForCategory(item.category);
      const matchGroup = activeGroup === 'Semua' || itemGroup === activeGroup;
      const matchSub = activeSubCategory === 'Semua' || item.category === activeSubCategory;
      const matchQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        itemGroup.toLowerCase().includes(q);
      return matchGroup && matchSub && matchQuery;
    });
  }, [menuItems, activeGroup, activeSubCategory, searchQuery]);

  const groupedSections = useMemo(() => {
    const sectionsToRender =
      activeGroup === 'Semua'
        ? MENU_GROUPS
        : MENU_GROUPS.filter((g) => g.id === activeGroup);

    return sectionsToRender
      .map((group) => ({
        group,
        items: filteredItems.filter((item) => getMenuGroupForCategory(item.category) === group.id),
      }))
      .filter((section) => section.items.length > 0);
  }, [filteredItems, activeGroup]);

  const handleSelectGroup = (groupId: MenuGroupId) => {
    setActiveGroup(groupId);
    setActiveSubCategory('Semua');
  };

  const getCartQty = (itemId: string) => {
    return cart.filter((c) => c.menuItem.id === itemId).reduce((acc, c) => acc + c.qty, 0);
  };

  const openDetail = (item: MenuItem) => {
    setDetailItem(item);
    setDetailQty(1);
    setDetailNote('');
  };

  const handleConfirmDetail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailItem || !detailItem.isAvailable) return;
    onAddToCart(detailItem, detailQty, detailNote.slice(0, LIMITS.ITEM_NOTE_MAX));
    setDetailItem(null);
  };

  const totalCartItems = cart.reduce((s, c) => s + c.qty, 0);
  const totalCartAmount = cart.reduce((s, c) => s + c.menuItem.price * c.qty, 0);

  return (
    <div className="space-y-14 pb-20">
      {/* Section 1: Coffee Shop Hero Split */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between bg-white border border-stone-200 rounded-2xl p-6 sm:p-10">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span className="font-semibold text-[#5C3A21]">{storeConfig.storeName}</span>
                <span aria-hidden="true">·</span>
                <span className={storeConfig.isOpen ? 'text-[#0D7A6F] font-semibold' : 'text-red-700 font-medium'}>
                  {storeConfig.isOpen ? 'Brew Bar Buka' : 'Sedang Tutup'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="truncate max-w-[240px]">{storeConfig.address}</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-[2.6rem] font-bold tracking-tight text-[#2B1D14] leading-[1.14] [text-wrap:balance]">
                Nikmati Seduhan Kopi Segar Langsung dari Meja Anda
              </h1>

              <p className="text-base text-stone-600 leading-relaxed max-w-xl">
                {storeConfig.tagline} Atur level gula, suhu es, atau pilihan susu oat dan bayar
                langsung dengan QRIS, Transfer Bank, maupun di kasir.
              </p>

              {/* QR Table / Pickup Context Selector */}
              <div className="pt-3 border-t border-stone-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-sm text-stone-700">
                    <QrCode className="w-4 h-4 text-[#0D7A6F] shrink-0" />
                    <span>
                      Meja / Layanan:{' '}
                      <strong className="font-semibold text-[#5C3A21]">
                        {activeTable ? activeTable.label : selectedTableCode || 'Pilih Meja'}
                      </strong>
                    </span>
                  </div>
                  <select
                    aria-label="Pilih Meja atau Layanan"
                    value={selectedTableCode}
                    onChange={(e) => onSelectTableCode(e.target.value)}
                    className="text-xs font-medium text-[#2B1D14] bg-[#FAF7F2] border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0D7A6F]/30"
                  >
                    {qrTables
                      .filter((t) => t.isActive)
                      .map((t) => (
                        <option key={t.id} value={t.code}>
                          {t.label} ({t.area})
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-8 flex flex-wrap items-center gap-4">
              <a
                href="#menu-katalog"
                className="inline-flex items-center gap-2 px-5 py-3 bg-[#0D7A6F] text-white text-sm font-semibold rounded-xl hover:bg-[#095E55] transition-colors whitespace-nowrap shrink-0"
              >
                Lihat Menu Seduhan
                <ArrowRight className="w-4 h-4" />
              </a>
              {totalCartItems > 0 && (
                <button
                  type="button"
                  onClick={onOpenCart}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-[#F3ECE4] text-[#5C3A21] text-sm font-semibold rounded-xl hover:bg-[#e8ded2] transition-colors whitespace-nowrap shrink-0 tabular-nums"
                >
                  Lanjut Bayar ({totalCartItems} item · {formatRupiah(totalCartAmount)})
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-72 sm:h-96 lg:h-full min-h-[340px] rounded-2xl overflow-hidden border border-stone-200 bg-[#F3ECE4]">
              <MenuImage
                src={HERO_IMAGE_URL}
                alt={`Bar seduh kopi ${storeConfig.storeName}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-6 text-white">
                <p className="text-xs font-medium text-white/85">
                  Specialty House Blend &amp; Manual Brew
                </p>
                <p className="text-base font-semibold mt-0.5">
                  Es Kopi Susu Gula Aren, V60 Gayo &amp; French Butter Croissant
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Column Coffee Shop Service Info Strip */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 border border-stone-200 bg-white rounded-2xl divide-y lg:divide-y-0 lg:divide-x divide-stone-200">
          <div className="p-5">
            <p className="text-xs text-stone-500">Waktu Seduh Barista</p>
            <p className="text-sm font-semibold text-stone-900 mt-1 tabular-nums">4 – 8 Menit</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-stone-500">Pembayaran Instan</p>
            <p className="text-sm font-semibold text-stone-900 mt-1">QRIS, Transfer Bank &amp; Kasir</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-stone-500">Biji Kopi Nusantara</p>
            <p className="text-sm font-semibold text-stone-900 mt-1">100% Arabika Pilihan</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-stone-500">Pajak &amp; Layanan</p>
            <p className="text-sm font-semibold text-stone-900 mt-1 tabular-nums">
              PB1 {storeConfig.taxPercent}% · Biaya {formatRupiah(storeConfig.serviceFee)}
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Grouped Menu Katalog (Minuman, Makanan, Camilan, Paket) */}
      <section id="menu-katalog" className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-stone-200 pb-5">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
              Menu Minuman, Makanan &amp; Camilan
            </h2>
            <p className="text-sm text-stone-600 mt-1">
              Telusuri menu berdasarkan kelompok produk atau klik item untuk catatan penyajian barista.
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kopi, matcha, croissant..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D7A6F]/30"
            />
          </div>
        </div>

        {/* Level 1: Primary Group Segmented Navigation */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Kelompok Menu">
            <button
              type="button"
              role="tab"
              aria-selected={activeGroup === 'Semua'}
              onClick={() => handleSelectGroup('Semua')}
              className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                activeGroup === 'Semua'
                  ? 'bg-[#5C3A21] text-white'
                  : 'bg-[#F3ECE4] text-[#5C3A21] hover:bg-[#e8ded2]'
              }`}
            >
              Semua ({groupCounts.Semua})
            </button>

            {visibleGroups.map((group) => {
              const active = activeGroup === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleSelectGroup(group.id)}
                  className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    active
                      ? 'bg-[#5C3A21] text-white'
                      : 'bg-[#F3ECE4] text-[#5C3A21] hover:bg-[#e8ded2]'
                  }`}
                >
                  {group.label} ({groupCounts[group.id]})
                </button>
              );
            })}
          </div>

          {/* Level 2: Contextual Sub-Category Filter when a Group has multiple sub-categories */}
          {subCategoriesForActiveGroup.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
              <span className="text-xs text-stone-500 whitespace-nowrap shrink-0">
                Sub-kategori:
              </span>
              <button
                type="button"
                onClick={() => setActiveSubCategory('Semua')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  activeSubCategory === 'Semua'
                    ? 'border-[#0D7A6F] bg-[#E5F4F2] text-[#0D7A6F]'
                    : 'border-stone-200 bg-white text-stone-600 hover:text-[#2B1D14]'
                }`}
              >
                Semua {activeGroup}
              </button>
              {subCategoriesForActiveGroup.map((subCat) => {
                const subActive = activeSubCategory === subCat;
                return (
                  <button
                    key={subCat}
                    type="button"
                    onClick={() => setActiveSubCategory(subCat)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      subActive
                        ? 'border-[#0D7A6F] bg-[#E5F4F2] text-[#0D7A6F]'
                        : 'border-stone-200 bg-white text-stone-600 hover:text-[#2B1D14]'
                    }`}
                  >
                    {subCat}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Grouped Menu Sections */}
        {groupedSections.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center space-y-3">
            <p className="text-base font-semibold text-[#2B1D14]">Menu tidak ditemukan</p>
            <p className="text-sm text-stone-500">
              Coba kata kunci lain atau pilih tab Semua untuk melihat seluruh kelompok menu kami.
            </p>
            <button
              type="button"
              onClick={() => {
                handleSelectGroup('Semua');
                setSearchQuery('');
              }}
              className="px-4 py-2 bg-[#F3ECE4] hover:bg-[#e8ded2] text-[#5C3A21] text-xs font-medium rounded-lg transition-colors"
            >
              Tampilkan Semua Menu
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {groupedSections.map(({ group, items }) => (
              <div key={group.id} className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-3 border-b border-stone-200">
                  <div className="space-y-0.5">
                    <div className="flex items-baseline gap-2.5">
                      <h3 className="text-xl font-bold text-[#5C3A21] tracking-tight">
                        {group.label}
                      </h3>
                      <span className="text-xs font-mono tabular-nums text-stone-500">
                        {items.length} menu
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-stone-600">{group.subtitle}</p>
                  </div>

                  {activeGroup === 'Semua' && visibleGroups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleSelectGroup(group.id)}
                      className="text-xs font-semibold text-[#0D7A6F] hover:underline whitespace-nowrap shrink-0 self-start sm:self-auto"
                    >
                      Fokus {group.label}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map((item) => (
                    <MenuCard
                      key={item.id}
                      item={item}
                      qtyInCart={getCartQty(item.id)}
                      storeIsOpen={storeConfig.isOpen}
                      onOpenDetail={openDetail}
                      onAddToCart={onAddToCart}
                      onUpdateCartQty={onUpdateCartQty}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 3: Cara Pesan Coffee Shop */}
      <section id="cara-pesan" className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-10 space-y-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold text-stone-900 tracking-tight">
              Pesan Kopi Tanpa Antre di Kasir
            </h2>
            <p className="text-sm text-stone-600 mt-1">
              Tetap duduk nyaman bekerja atau berbincang, barista kami langsung menyeduh pesanan Anda.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="space-y-2 border-t border-stone-200 pt-4">
              <p className="text-xs font-mono font-semibold text-[#0D7A6F]">01. Scan Barcode Meja</p>
              <h3 className="text-base font-semibold text-[#5C3A21]">Pilih Racikan & Catatan</h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                Arahkan kamera ke QR meja untuk memilih espresso, manual brew, non-kopi, dan pastry
                lengkap dengan catatan level gula atau es.
              </p>
            </div>

            <div className="space-y-2 border-t border-stone-200 pt-4">
              <p className="text-xs font-mono font-semibold text-[#0D7A6F]">02. Pembayaran Terintegrasi</p>
              <h3 className="text-base font-semibold text-[#5C3A21]">QRIS, Transfer, atau Kasir</h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                Selesaikan pembayaran secara langsung via QRIS kedai, Virtual Account bank,
                E-Wallet, atau tunai di bar kasir.
              </p>
            </div>

            <div className="space-y-2 border-t border-stone-200 pt-4">
              <p className="text-xs font-mono font-semibold text-[#0D7A6F]">03. Disajikan ke Meja</p>
              <h3 className="text-base font-semibold text-[#5C3A21]">Pantau Progres Barista</h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                Dapatkan struk digital dan pantau status seduhan dari antrean bar hingga siap
                diantar ke meja Anda.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Product Detail & Custom Barista Note Modal */}
      {detailItem && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-modal-title"
        >
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full overflow-hidden">
            <div className="aspect-[16/10] w-full bg-[#F3ECE4] relative">
              <MenuImage
                src={detailItem.imageUrl}
                alt={detailItem.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                aria-label="Tutup detail menu"
                onClick={() => setDetailItem(null)}
                className="absolute top-3 right-3 w-9 h-9 bg-white/95 text-stone-800 rounded-full flex items-center justify-center border border-stone-200 hover:bg-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDetail} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <span>{detailItem.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>Estimasi seduh {detailItem.prepMinutes} menit</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <h3 id="detail-modal-title" className="text-xl font-bold text-[#2B1D14]">
                    {detailItem.name}
                  </h3>
                  <span className="text-lg font-bold font-mono tabular-nums text-[#5C3A21] shrink-0">
                    {formatRupiah(detailItem.price)}
                  </span>
                </div>
                <p className="text-sm text-stone-600 leading-relaxed">{detailItem.description}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5">
                  Catatan Barista (Opsional)
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.ITEM_NOTE_MAX}
                  value={detailNote}
                  onChange={(e) => setDetailNote(e.target.value)}
                  placeholder="Contoh: Less sugar, es sedikit, double shot, hangatkan croissant..."
                  className="w-full px-3.5 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D7A6F]/30"
                />
              </div>

              <div className="flex items-center justify-between gap-4 pt-2 border-t border-stone-100">
                <div className="inline-flex items-center gap-2 bg-[#F3ECE4] rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-stone-200 text-[#5C3A21]"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold tabular-nums text-[#2B1D14]">
                    {detailQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDetailQty((q) => Math.min(20, q + 1))}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-stone-200 text-[#5C3A21]"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!detailItem.isAvailable || !storeConfig.isOpen}
                  className="flex-1 py-3 px-5 bg-[#0D7A6F] text-white text-sm font-semibold rounded-xl hover:bg-[#095E55] disabled:bg-stone-300 disabled:text-stone-500 transition-colors whitespace-nowrap tabular-nums"
                >
                  {detailItem.isAvailable && storeConfig.isOpen
                    ? `Tambah · ${formatRupiah(detailItem.price * detailQty)}`
                    : 'Tidak Tersedia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
