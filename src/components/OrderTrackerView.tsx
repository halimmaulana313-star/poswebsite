import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Printer,
  Search,
  Utensils,
} from 'lucide-react';
import {
  lookupOrderByCode,
  submitCustomerPaymentConfirmation,
  subscribeOrderById,
} from '../services/firestoreService';
import {
  formatRupiah,
  formatTimestamp,
  ORDER_STATUS_META,
  OrderRecord,
  OrderStatus,
  PAYMENT_METHOD_META,
  PAYMENT_STATUS_META,
  StoreConfig,
} from '../types';
import { QrCodeCanvas } from './QrCodeCanvas';

interface OrderTrackerViewProps {
  activeOrderId: string | null;
  recentOrders: { orderId: string; orderCode: string }[];
  storeConfig: StoreConfig;
  onSelectOrderId: (orderId: string) => void;
  onNotify: (msg: string) => void;
}

const PROGRESS_STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'new', label: 'Pesanan Masuk' },
  { key: 'preparing', label: 'Diproses Dapur' },
  { key: 'ready', label: 'Siap Disajikan' },
  { key: 'completed', label: 'Selesai' },
];

export const OrderTrackerView: React.FC<OrderTrackerViewProps> = ({
  activeOrderId,
  recentOrders,
  storeConfig,
  onSelectOrderId,
  onNotify,
}) => {
  const [searchCode, setSearchCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [confirmingPay, setConfirmingPay] = useState(false);

  useEffect(() => {
    if (!activeOrderId) {
      setOrder(null);
      return;
    }
    const unsub = subscribeOrderById(activeOrderId, (fetched) => {
      setOrder(fetched);
    });
    return () => unsub();
  }, [activeOrderId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCode.trim()) return;
    setSearching(true);
    setLookupError('');
    try {
      const found = await lookupOrderByCode(searchCode);
      if (!found) {
        setLookupError('Kode pesanan tidak ditemukan. Periksa kembali format seperti ORD-AB1234.');
      } else {
        onSelectOrderId(found.orderId);
      }
    } catch {
      setLookupError('Gagal mencari kode pesanan.');
    } finally {
      setSearching(false);
    }
  };

  const handleConfirmUnpaid = async () => {
    if (!order) return;
    setConfirmingPay(true);
    try {
      await submitCustomerPaymentConfirmation(
        order.id,
        order.orderCode,
        `${order.paymentMethod.toUpperCase()}-${order.orderCode}`
      );
      onNotify('Konfirmasi pembayaran terkirim ke kasir.');
    } catch {
      onNotify('Gagal mengirim konfirmasi pembayaran. Silakan coba lagi.');
    } finally {
      setConfirmingPay(false);
    }
  };

  const currentStepIndex = order
    ? PROGRESS_STEPS.findIndex((s) => s.key === order.orderStatus)
    : -1;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="no-print space-y-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">
            Cek Status Pesanan & Struk Digital
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            Pantau progres dapur dan status verifikasi pembayaran secara real-time.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              placeholder="Masukkan kode pesanan (contoh: ORD-AB1234)"
              className="w-full pl-10 pr-4 py-2.5 text-sm font-mono bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D7A6F]/30"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-5 py-2.5 bg-[#0D7A6F] text-white text-sm font-semibold rounded-xl hover:bg-[#095E55] transition-colors whitespace-nowrap shrink-0"
          >
            {searching ? 'Mencari...' : 'Lacak Pesanan'}
          </button>
        </form>

        {lookupError && (
          <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {lookupError}
          </p>
        )}

        {recentOrders.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Pesanan Terakhir Anda:</span>
            {recentOrders.map((ro) => (
              <button
                key={ro.orderId}
                type="button"
                onClick={() => onSelectOrderId(ro.orderId)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors ${
                  activeOrderId === ro.orderId
                    ? 'bg-[#5C3A21] text-white border-[#5C3A21]'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                {ro.orderCode}
              </button>
            ))}
          </div>
        )}
      </div>

      {!order ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center space-y-2">
          <Utensils className="w-8 h-8 text-zinc-300 mx-auto" />
          <p className="text-base font-semibold text-zinc-900">Belum ada pesanan dipilih</p>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Masukkan kode pesanan Anda di atas atau buat pesanan baru melalui halaman Menu.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          {/* Receipt Header */}
          <div className="p-6 sm:p-8 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>{storeConfig.storeName}</span>
                <span aria-hidden="true">·</span>
                <span>{formatTimestamp(order.createdAt)}</span>
              </div>
              <h2 className="text-2xl font-bold font-mono text-zinc-900">{order.orderCode}</h2>
              <p className="text-sm text-zinc-600">
                Pemesan: <strong className="text-zinc-900">{order.customerAlias}</strong> ·{' '}
                {order.tableLabel}
              </p>
            </div>

            <div className="flex flex-col sm:items-end gap-2">
              <div className="text-sm font-semibold">
                Status Dapur:{' '}
                <span
                  className={
                    ORDER_STATUS_META[order.orderStatus].tone === 'emerald'
                      ? 'text-emerald-700'
                      : ORDER_STATUS_META[order.orderStatus].tone === 'amber'
                        ? 'text-amber-700'
                        : ORDER_STATUS_META[order.orderStatus].tone === 'red'
                          ? 'text-red-700'
                          : 'text-zinc-700'
                  }
                >
                  {ORDER_STATUS_META[order.orderStatus].label}
                </span>
              </div>
              <div className="text-xs font-medium">
                Pembayaran ({PAYMENT_METHOD_META[order.paymentMethod].shortLabel}):{' '}
                <span
                  className={
                    PAYMENT_STATUS_META[order.paymentStatus].tone === 'emerald'
                      ? 'text-emerald-700 font-semibold'
                      : PAYMENT_STATUS_META[order.paymentStatus].tone === 'amber'
                        ? 'text-amber-700 font-semibold'
                        : 'text-red-700 font-semibold'
                  }
                >
                  {PAYMENT_STATUS_META[order.paymentStatus].label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Struk
              </button>
            </div>
          </div>

          {/* Live Kitchen Stepper */}
          {order.orderStatus !== 'cancelled' && (
            <div className="px-6 sm:px-8 py-5 bg-zinc-50 border-b border-zinc-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {PROGRESS_STEPS.map((step, idx) => {
                  const done = idx <= currentStepIndex;
                  return (
                    <div key={step.key} className="flex items-center gap-2.5">
                      {done ? (
                        <CheckCircle2 className="w-5 h-5 text-[#0D7A6F] shrink-0" />
                      ) : (
                        <Clock className="w-5 h-5 text-zinc-300 shrink-0" />
                      )}
                      <div>
                        <p
                          className={`text-xs font-semibold ${
                            done ? 'text-zinc-900' : 'text-zinc-400'
                          }`}
                        >
                          {step.label}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unpaid QRIS Reminder if customer hasn't confirmed yet */}
          {order.paymentStatus === 'unpaid' && order.orderStatus !== 'cancelled' && (
            <div className="no-print p-6 sm:px-8 bg-amber-50/70 border-b border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-900">
                  {order.paymentMethod === 'cashier'
                    ? 'Silakan lakukan pembayaran di meja kasir'
                    : 'Pembayaran menunggu konfirmasi Anda'}
                </p>
                <p className="text-xs text-amber-800">
                  Total tagihan: <strong className="font-mono">{formatRupiah(order.totalAmount)}</strong>
                  {order.paymentMethod === 'va_bank' &&
                    ` · ${storeConfig.bankName} ${storeConfig.bankAccountNumber}`}
                </p>
              </div>
              {order.paymentMethod !== 'cashier' && (
                <div className="flex items-center gap-4">
                  {order.paymentMethod === 'qris' &&
                    (storeConfig.qrisImageUrl ? (
                      <div className="bg-white border border-zinc-200 rounded-xl p-1.5 shrink-0">
                        <img
                          src={storeConfig.qrisImageUrl}
                          alt={`QRIS ${storeConfig.qrisMerchantName}`}
                          referrerPolicy="no-referrer"
                          className="w-24 h-24 object-contain rounded-md"
                        />
                      </div>
                    ) : (
                      <QrCodeCanvas
                        value={`ID.CO.QRIS.WWW|NMID=${storeConfig.qrisNmid}|INV=${order.orderCode}|AMT=${order.totalAmount}`}
                        size={96}
                      />
                    ))}
                  <button
                    type="button"
                    disabled={confirmingPay}
                    onClick={handleConfirmUnpaid}
                    className="px-4 py-2.5 bg-[#0D7A6F] text-white text-xs font-semibold rounded-xl hover:bg-[#095E55] whitespace-nowrap"
                  >
                    {confirmingPay ? 'Mengirim...' : 'Konfirmasi Sudah Bayar'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Itemized Receipt Breakdown */}
          <div className="p-6 sm:p-8 space-y-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Rincian Pesanan
            </h3>
            <div className="divide-y divide-zinc-100">
              {order.items.map((item, idx) => (
                <div key={`${item.menuItemId}-${idx}`} className="py-3 flex justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      <span className="font-mono tabular-nums">{item.qty}×</span> {item.name}
                    </p>
                    {item.note && <p className="text-xs text-zinc-500">Catatan: {item.note}</p>}
                  </div>
                  <span className="text-sm font-mono tabular-nums text-zinc-900">
                    {formatRupiah(item.price * item.qty)}
                  </span>
                </div>
              ))}
            </div>

            {order.notes && (
              <p className="text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                Catatan Pesanan: {order.notes}
              </p>
            )}

            <div className="border-t border-zinc-200 pt-4 space-y-2 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatRupiah(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Pajak</span>
                <span className="font-mono tabular-nums">{formatRupiah(order.taxAmount)}</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Biaya Layanan</span>
                <span className="font-mono tabular-nums">{formatRupiah(order.serviceFee)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#2B1D14] pt-2 border-t border-zinc-200">
                <span>Total</span>
                <span className="font-mono tabular-nums text-[#5C3A21]">
                  {formatRupiah(order.totalAmount)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
