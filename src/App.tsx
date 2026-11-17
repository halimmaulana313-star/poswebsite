import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { CheckCircle2, ShoppingBag } from 'lucide-react';
import { CartDrawer } from './components/CartDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OrderTrackerView } from './components/OrderTrackerView';
import { StorefrontView } from './components/StorefrontView';
import { WebMasterView } from './components/WebMasterView';
import {
  DEFAULT_STORE_CONFIG,
  STARTER_MENU_ITEMS,
  STARTER_QR_TABLES,
} from './data/defaults';
import { auth } from './lib/firebase';
import {
  lookupOrderByCode,
  subscribeMenuItems,
  subscribeQrTables,
  subscribeStoreConfig,
} from './services/firestoreService';
import { CartItem, MenuItem, QrTable, StoreConfig } from './types';

type AppPage = 'storefront' | 'tracker' | 'master';

const RECENT_ORDERS_KEY = 'sajilokal_recent_orders_v1';

export default function App() {
  const [page, setPage] = useState<AppPage>('storefront');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Firestore real-time catalog state
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(DEFAULT_STORE_CONFIG);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(STARTER_MENU_ITEMS);
  const [qrTables, setQrTables] = useState<QrTable[]>(STARTER_QR_TABLES);
  const [dbStatus, setDbStatus] = useState({ config: false, menu: false, tables: false });

  // Customer Table QR & Cart state
  const [selectedTableCode, setSelectedTableCode] = useState<string>('Meja-01');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartAnimating, setCartAnimating] = useState(false);
  const cartAnimTimerRef = useRef<number | null>(null);

  // Order Tracker state
  const [recentOrders, setRecentOrders] = useState<{ orderId: string; orderCode: string }[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_ORDERS_KEY);
      return raw ? (JSON.parse(raw) as { orderId: string; orderCode: string }[]) : [];
    } catch {
      return [];
    }
  });
  const [activeOrderId, setActiveOrderId] = useState<string | null>(
    recentOrders[0]?.orderId || null
  );

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToastMsg(msg);
  };

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Parse URL params (?table=Meja-04, ?view=master, ?order=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    const viewParam = params.get('view');
    const orderParam = params.get('order');

    if (tableParam) {
      setSelectedTableCode(tableParam);
      setPage('storefront');
    } else if (viewParam === 'master') {
      setPage('master');
    } else if (orderParam) {
      setPage('tracker');
      const trimmed = orderParam.trim();
      if (trimmed.toUpperCase().startsWith('ORD-') && trimmed.length < 16) {
        lookupOrderByCode(trimmed)
          .then((found) => {
            if (found?.orderId) setActiveOrderId(found.orderId);
          })
          .catch(() => {
            // Lookup error handled silently on initial deep link
          });
      } else {
        setActiveOrderId(trimmed);
      }
    }
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Public Firestore subscriptions for Storefront catalog & QR tables
  useEffect(() => {
    const unsubCfg = subscribeStoreConfig((cfg, exists) => {
      setStoreConfig(cfg);
      setDbStatus((prev) => ({ ...prev, config: exists }));
    });
    const unsubMenu = subscribeMenuItems((items, exists) => {
      setMenuItems(items);
      setDbStatus((prev) => ({ ...prev, menu: exists }));
    });
    const unsubTables = subscribeQrTables((tables, exists) => {
      setQrTables(tables);
      setDbStatus((prev) => ({ ...prev, tables: exists }));
    });

    return () => {
      unsubCfg();
      unsubMenu();
      unsubTables();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (cartAnimTimerRef.current !== null) {
        window.clearTimeout(cartAnimTimerRef.current);
      }
    };
  }, []);

  const triggerCartAnimation = () => {
    if (cartAnimTimerRef.current !== null) {
      window.clearTimeout(cartAnimTimerRef.current);
    }
    setCartAnimating(false);
    window.requestAnimationFrame(() => {
      setCartAnimating(true);
      cartAnimTimerRef.current = window.setTimeout(() => {
        setCartAnimating(false);
        cartAnimTimerRef.current = null;
      }, 680);
    });
  };

  const handleAddToCart = (item: MenuItem, qty: number, note: string) => {
    setCart((prev) => {
      const normalizedNote = note.trim();
      const idx = prev.findIndex(
        (c) => c.menuItem.id === item.id && c.note.trim() === normalizedNote
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: Math.min(99, next[idx].qty + qty) };
        return next;
      }
      return [...prev, { menuItem: item, qty, note: normalizedNote }];
    });
    triggerCartAnimation();
    notify(`${item.name} ditambahkan ke keranjang.`);
  };

  const handleUpdateCartQty = (menuItemId: string, delta: number, note?: string) => {
    setCart((prev) => {
      return prev
        .map((c) => {
          const matchNote = note === undefined ? true : c.note === note;
          if (c.menuItem.id === menuItemId && matchNote) {
            return { ...c, qty: c.qty + delta };
          }
          return c;
        })
        .filter((c) => c.qty > 0);
    });
    if (delta > 0) {
      triggerCartAnimation();
    }
  };

  const handleRemoveCartItem = (menuItemId: string, note?: string) => {
    setCart((prev) =>
      prev.filter((c) => !(c.menuItem.id === menuItemId && (note === undefined || c.note === note)))
    );
  };

  const handleOrderCreated = (orderId: string, orderCode: string) => {
    const updated = [{ orderId, orderCode }, ...recentOrders.filter((r) => r.orderId !== orderId)].slice(
      0,
      6
    );
    setRecentOrders(updated);
    try {
      localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage quota errors
    }
    setActiveOrderId(orderId);
    setCartOpen(false);
    setPage('tracker');
  };

  const handlePreviewTableLink = (tableCode: string) => {
    setSelectedTableCode(tableCode);
    setPage('storefront');
    const url = new URL(window.location.href);
    url.searchParams.set('table', tableCode);
    url.searchParams.delete('view');
    window.history.replaceState({}, '', url.toString());
    notify(`Pratinjau pelanggan aktif untuk ${tableCode}.`);
  };

  const totalCartItems = cart.reduce((sum, item) => sum + item.qty, 0);

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2B1D14]">
        {/* Strictly 3-Zone Top Bar Contract */}
        <header className="no-print sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
            {/* Zone 1: Brand Title (Single text element, one line) */}
            <button
              type="button"
              onClick={() => setPage('storefront')}
              className="text-xl font-bold font-display tracking-tight text-[#5C3A21] whitespace-nowrap shrink-0"
            >
              SajiLokal
            </button>

            {/* Zone 2: 4 Single-line Navigation Links */}
            <nav className="flex items-center gap-5 sm:gap-7 text-sm font-medium text-stone-600 overflow-x-auto">
              <button
                type="button"
                onClick={() => setPage('storefront')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#2B1D14] ${
                  page === 'storefront' ? 'text-[#5C3A21] font-semibold underline decoration-[#0D7A6F] decoration-2 underline-offset-8' : ''
                }`}
              >
                Menu
              </button>
              <a
                href="#cara-pesan"
                onClick={(e) => {
                  if (page !== 'storefront') {
                    e.preventDefault();
                    setPage('storefront');
                    setTimeout(() => {
                      document.getElementById('cara-pesan')?.scrollIntoView({ behavior: 'smooth' });
                    }, 80);
                  }
                }}
                className="hidden sm:inline whitespace-nowrap shrink-0 transition-colors hover:text-[#2B1D14]"
              >
                Cara Pesan
              </a>
              <button
                type="button"
                onClick={() => setPage('tracker')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#2B1D14] ${
                  page === 'tracker' ? 'text-[#5C3A21] font-semibold underline decoration-[#0D7A6F] decoration-2 underline-offset-8' : ''
                }`}
              >
                Cek Pesanan
              </button>
              <button
                type="button"
                onClick={() => setPage('master')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#2B1D14] ${
                  page === 'master' ? 'text-[#5C3A21] font-semibold underline decoration-[#0D7A6F] decoration-2 underline-offset-8' : ''
                }`}
              >
                Web Master
              </button>
            </nav>

            {/* Zone 3: 1 Primary Action CTA */}
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className={`inline-flex items-center gap-2 px-4 py-2 bg-[#0D7A6F] text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-[#095E55] transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  cartAnimating ? 'animate-cart-bounce' : ''
                }`}
              >
                <ShoppingBag className={`w-4 h-4 ${cartAnimating ? 'scale-110 transition-transform' : ''}`} />
                <span>Keranjang ({totalCartItems})</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1">
          {page === 'storefront' && (
            <StorefrontView
              storeConfig={storeConfig}
              menuItems={menuItems}
              qrTables={qrTables}
              selectedTableCode={selectedTableCode}
              onSelectTableCode={setSelectedTableCode}
              cart={cart}
              onAddToCart={handleAddToCart}
              onUpdateCartQty={handleUpdateCartQty}
              onOpenCart={() => setCartOpen(true)}
            />
          )}

          {page === 'tracker' && (
            <OrderTrackerView
              activeOrderId={activeOrderId}
              recentOrders={recentOrders}
              storeConfig={storeConfig}
              onSelectOrderId={setActiveOrderId}
              onNotify={notify}
            />
          )}

          {page === 'master' && (
            <WebMasterView
              user={user}
              authReady={authReady}
              storeConfig={storeConfig}
              menuItems={menuItems}
              qrTables={qrTables}
              dbStatus={dbStatus}
              onPreviewTableLink={handlePreviewTableLink}
              onBackToStorefront={() => setPage('storefront')}
              onNotify={notify}
            />
          )}
        </main>

        {/* Clean Footer */}
        <footer className="no-print border-t border-stone-200 bg-white mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-600">
            <p>
              {storeConfig.storeName} · {storeConfig.address} · WhatsApp {storeConfig.whatsappNumber}
            </p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setPage('storefront')}
                className="hover:text-[#0D7A6F] transition-colors"
              >
                Etalase Menu
              </button>
              <button
                type="button"
                onClick={() => setPage('tracker')}
                className="hover:text-[#0D7A6F] transition-colors"
              >
                Cek Pesanan
              </button>
              <button
                type="button"
                onClick={() => setPage('master')}
                className="hover:text-[#0D7A6F] transition-colors"
              >
                Panel Web Master
              </button>
            </div>
          </div>
        </footer>

        {/* Slide-Over Cart & Integrated Payment Drawer */}
        <CartDrawer
          isOpen={cartOpen}
          onClose={() => setCartOpen(false)}
          cart={cart}
          storeConfig={storeConfig}
          qrTables={qrTables}
          selectedTableCode={selectedTableCode}
          onSelectTableCode={setSelectedTableCode}
          onUpdateQty={handleUpdateCartQty}
          onRemoveItem={handleRemoveCartItem}
          onClearCart={() => setCart([])}
          onOrderCreated={handleOrderCreated}
          onNotify={notify}
        />

        {/* Inline Toast Notification */}
        {toastMsg && (
          <div
            role="status"
            className="no-print fixed bottom-5 right-5 z-50 bg-zinc-900 text-white px-4 py-3 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2.5 max-w-sm shadow-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMsg}</span>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
