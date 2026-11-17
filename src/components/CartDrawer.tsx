import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  CreditCard,
  Minus,
  Plus,
  QrCode,
  Receipt,
  ShieldCheck,
  Store,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  createCustomerOrder,
  submitCustomerPaymentConfirmation,
} from '../services/firestoreService';
import {
  CartItem,
  formatRupiah,
  LIMITS,
  OrderType,
  PAYMENT_METHOD_META,
  PaymentMethod,
  QrTable,
  StoreConfig,
} from '../types';
import { QrCodeCanvas } from './QrCodeCanvas';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  storeConfig: StoreConfig;
  qrTables: QrTable[];
  selectedTableCode: string;
  onSelectTableCode: (code: string) => void;
  onUpdateQty: (menuItemId: string, delta: number, note?: string) => void;
  onRemoveItem: (menuItemId: string, note?: string) => void;
  onClearCart: () => void;
  onOrderCreated: (orderId: string, orderCode: string) => void;
  onNotify: (msg: string) => void;
}

type DrawerStep = 'cart' | 'payment';

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  storeConfig,
  qrTables,
  selectedTableCode,
  onSelectTableCode,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onOrderCreated,
  onNotify,
}) => {
  const [step, setStep] = useState<DrawerStep>('cart');
  const [customerAlias, setCustomerAlias] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    storeConfig.enabledPayments[0] || 'qris'
  );
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (
      storeConfig.enabledPayments.length > 0 &&
      !storeConfig.enabledPayments.includes(paymentMethod)
    ) {
      setPaymentMethod(storeConfig.enabledPayments[0]);
    }
  }, [storeConfig.enabledPayments, paymentMethod]);
  const [errorMsg, setErrorMsg] = useState('');

  // Active pending order awaiting payment
  const [createdOrder, setCreatedOrder] = useState<{
    orderId: string;
    orderCode: string;
    totalAmount: number;
    method: PaymentMethod;
  } | null>(null);
  const [paymentRefInput, setPaymentRefInput] = useState('');
  const [confirmingPay, setConfirmingPay] = useState(false);

  const selectedTable = useMemo(
    () => qrTables.find((t) => t.code === selectedTableCode) || qrTables[0],
    [qrTables, selectedTableCode]
  );

  const orderType: OrderType = useMemo(() => {
    if (!selectedTable) return 'takeaway';
    if (selectedTable.area === 'Delivery') return 'delivery';
    if (selectedTable.area === 'Takeaway') return 'takeaway';
    return 'dine_in';
  }, [selectedTable]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.menuItem.price * item.qty, 0),
    [cart]
  );
  const taxAmount = Math.round((subtotal * Math.max(0, storeConfig.taxPercent)) / 100);
  const serviceFee = cart.length > 0 ? storeConfig.serviceFee : 0;
  const totalAmount = subtotal + taxAmount + serviceFee;

  if (!isOpen) return null;

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(`${label} berhasil disalin.`);
    } catch {
      onNotify(`Salin manual: ${text}`);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (cart.length === 0) {
      setErrorMsg('Keranjang masih kosong.');
      return;
    }
    if (customerAlias.trim().length < 2) {
      setErrorMsg('Mohon isi nama pemesan minimal 2 huruf.');
      return;
    }
    if (customerPhone.trim().length < 8) {
      setErrorMsg('Mohon isi nomor WhatsApp yang valid untuk konfirmasi.');
      return;
    }
    if (orderType === 'delivery' && deliveryAddress.trim().length < 6) {
      setErrorMsg('Mohon isi alamat lengkap pengantaran.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await createCustomerOrder({
        cart,
        tableCode: selectedTable?.code || selectedTableCode || 'Takeaway',
        tableLabel: selectedTable?.label || selectedTableCode || 'Takeaway',
        orderType,
        customerAlias: customerAlias.trim(),
        customerPhone: customerPhone.trim(),
        deliveryAddress: deliveryAddress.trim(),
        notes: orderNotes.trim(),
        paymentMethod,
        storeConfig,
      });

      setCreatedOrder({
        orderId: result.orderId,
        orderCode: result.orderCode,
        totalAmount,
        method: paymentMethod,
      });
      onClearCart();
      setStep('payment');
      onNotify(`Pesanan ${result.orderCode} dibuat. Lanjutkan pembayaran.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat pesanan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!createdOrder) return;
    setConfirmingPay(true);
    setErrorMsg('');
    try {
      const refText =
        paymentRefInput.trim() ||
        `${createdOrder.method.toUpperCase()}-${createdOrder.orderCode}`;
      await submitCustomerPaymentConfirmation(
        createdOrder.orderId,
        createdOrder.orderCode,
        refText
      );
      const finishedId = createdOrder.orderId;
      const finishedCode = createdOrder.orderCode;
      setCreatedOrder(null);
      setStep('cart');
      setPaymentRefInput('');
      onOrderCreated(finishedId, finishedCode);
      onNotify(`Konfirmasi pembayaran ${finishedCode} dikirim ke kasir.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim konfirmasi.');
    } finally {
      setConfirmingPay(false);
    }
  };

  const handleTrackDirectly = () => {
    if (!createdOrder) return;
    const finishedId = createdOrder.orderId;
    const finishedCode = createdOrder.orderCode;
    setCreatedOrder(null);
    setStep('cart');
    onOrderCreated(finishedId, finishedCode);
  };

  const qrisPayload = createdOrder
    ? `ID.CO.QRIS.WWW|NMID=${storeConfig.qrisNmid}|MERCHANT=${storeConfig.qrisMerchantName}|INV=${createdOrder.orderCode}|AMT=${createdOrder.totalAmount}`
    : '';

  const vaNumber = createdOrder
    ? `${storeConfig.bankAccountNumber.replace(/\D/g, '').slice(0, 6)}${createdOrder.orderCode.replace(/\D/g, '').padStart(6, '0')}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45" role="dialog" aria-modal="true">
      <div className="bg-white w-full max-w-lg h-full flex flex-col border-l border-zinc-200">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              {step === 'cart' ? 'Keranjang & Checkout' : 'Pembayaran Terintegrasi'}
            </h2>
            <p className="text-xs text-zinc-500">
              {step === 'cart'
                ? `${storeConfig.storeName} · ${selectedTable?.label || 'Takeaway'}`
                : `Kode Pesanan ${createdOrder?.orderCode}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup keranjang"
            onClick={onClose}
            className="w-9 h-9 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-800">
              {errorMsg}
            </div>
          )}

          {step === 'payment' && createdOrder ? (
            <div className="space-y-6">
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>Total Tagihan</span>
                  <span className="font-mono">{createdOrder.orderCode}</span>
                </div>
                <p className="text-2xl font-bold font-mono tabular-nums text-zinc-900">
                  {formatRupiah(createdOrder.totalAmount)}
                </p>
                <p className="text-xs text-zinc-600">
                  Metode: <strong>{PAYMENT_METHOD_META[createdOrder.method].label}</strong>
                </p>
              </div>

              {createdOrder.method === 'qris' && (
                <div className="border border-zinc-200 rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-zinc-900 uppercase tracking-wide">
                      {storeConfig.qrisMerchantName}
                    </p>
                    <p className="text-xs font-mono text-zinc-500">NMID: {storeConfig.qrisNmid}</p>
                  </div>
                  {storeConfig.qrisImageUrl ? (
                    <div className="inline-flex flex-col items-center gap-2.5">
                      <div className="bg-white border border-zinc-200 rounded-xl p-2.5">
                        <img
                          src={storeConfig.qrisImageUrl}
                          alt={`QRIS ${storeConfig.qrisMerchantName}`}
                          referrerPolicy="no-referrer"
                          className="w-56 max-h-72 object-contain rounded-lg"
                        />
                      </div>
                      <a
                        href={storeConfig.qrisImageUrl}
                        download={`QRIS-${createdOrder.orderCode}.jpg`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
                      >
                        Unduh Gambar QRIS
                      </a>
                    </div>
                  ) : (
                    <QrCodeCanvas
                      value={qrisPayload}
                      size={210}
                      downloadName={`QRIS-${createdOrder.orderCode}.png`}
                      showDownload
                    />
                  )}
                  <p className="text-xs text-zinc-600 max-w-xs leading-relaxed">
                    Scan kode QRIS di atas melalui GoPay, OVO, DANA, ShopeePay, atau aplikasi
                    mobile banking dengan nominal tepat{' '}
                    <strong className="tabular-nums">{formatRupiah(createdOrder.totalAmount)}</strong>.
                  </p>
                </div>
              )}

              {createdOrder.method === 'va_bank' && (
                <div className="border border-zinc-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Bank Tujuan</span>
                    <span className="text-sm font-semibold text-zinc-900">{storeConfig.bankName}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
                    <div>
                      <p className="text-xs text-zinc-500">No. Rekening / Virtual Account</p>
                      <p className="text-base font-mono font-bold text-zinc-900 tabular-nums">
                        {storeConfig.bankAccountNumber}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        a.n. {storeConfig.bankAccountHolder} · Ref: {vaNumber}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(storeConfig.bankAccountNumber, 'Nomor rekening')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-zinc-200 rounded-lg hover:bg-zinc-100 shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Salin
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
                    <div>
                      <p className="text-xs text-zinc-500">Nominal Transfer</p>
                      <p className="text-base font-mono font-bold text-zinc-900 tabular-nums">
                        {formatRupiah(createdOrder.totalAmount)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(String(createdOrder.totalAmount), 'Nominal')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-zinc-200 rounded-lg hover:bg-zinc-100 shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Salin
                    </button>
                  </div>
                </div>
              )}

              {createdOrder.method === 'ewallet' && (
                <div className="border border-zinc-200 rounded-2xl p-5 space-y-3">
                  <p className="text-sm font-semibold text-zinc-900">Transfer E-Wallet Langsung</p>
                  <p className="text-sm font-mono bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-zinc-900">
                    {storeConfig.ewalletLabel}
                  </p>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Cantumkan kode pesanan <strong className="font-mono">{createdOrder.orderCode}</strong> di
                    catatan transfer untuk mempercepat verifikasi kasir.
                  </p>
                </div>
              )}

              {createdOrder.method === 'cashier' && (
                <div className="border border-zinc-200 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2.5 text-[#0D7A6F]">
                    <Store className="w-5 h-5" />
                    <p className="text-sm font-semibold">Pesanan Terkirim ke Dapur & Kasir</p>
                  </div>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    Tunjukkan kode pesanan <strong className="font-mono">{createdOrder.orderCode}</strong>{' '}
                    saat melakukan pembayaran tunai atau kartu di meja kasir.
                  </p>
                </div>
              )}

              {createdOrder.method !== 'cashier' ? (
                <div className="space-y-4 pt-2 border-t border-zinc-200">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                      No. Referensi / Nama Pengirim (Opsional)
                    </label>
                    <input
                      type="text"
                      maxLength={LIMITS.PAYMENT_REF_MAX}
                      value={paymentRefInput}
                      onChange={(e) => setPaymentRefInput(e.target.value)}
                      placeholder="Contoh: GoPay a.n. Budi / Ref 88219"
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D7A6F]/30"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={confirmingPay}
                    onClick={handleConfirmPayment}
                    className="w-full py-3 px-4 bg-[#0D7A6F] text-white text-sm font-semibold rounded-xl hover:bg-[#095E55] disabled:bg-zinc-300 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {confirmingPay ? 'Mengirim Konfirmasi...' : 'Saya Sudah Bayar · Kirim ke Kasir'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTrackDirectly}
                    className="w-full py-2.5 px-4 bg-[#F3ECE4] text-[#5C3A21] text-xs font-medium rounded-xl hover:bg-[#e8ded2] transition-colors"
                  >
                    Lihat Struk & Pantau Status Nanti
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleTrackDirectly}
                  className="w-full py-3 px-4 bg-[#0D7A6F] text-white text-sm font-semibold rounded-xl hover:bg-[#095E55] transition-colors flex items-center justify-center gap-2"
                >
                  <Receipt className="w-4 h-4" />
                  Buka Struk Digital & Pantau Pesanan
                </button>
              )}
            </div>
          ) : cart.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-base font-semibold text-zinc-900">Keranjang Anda masih kosong</p>
              <p className="text-sm text-zinc-500 max-w-xs mx-auto">
                Tambahkan makanan atau minuman dari daftar menu untuk mulai memesan.
              </p>
            </div>
          ) : (
            <form id="checkout-form" onSubmit={handleCheckout} className="space-y-6">
              {/* Itemized List */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Ringkasan Menu ({cart.reduce((s, c) => s + c.qty, 0)} item)
                </h3>
                <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-2xl bg-white">
                  {cart.map((item) => (
                    <div
                      key={`${item.menuItem.id}__${item.note}`}
                      className="p-4 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-semibold text-zinc-900 truncate">
                          {item.menuItem.name}
                        </p>
                        {item.note && (
                          <p className="text-xs text-zinc-500">Catatan: {item.note}</p>
                        )}
                        <p className="text-xs font-mono tabular-nums text-zinc-600">
                          {formatRupiah(item.menuItem.price)} × {item.qty} ={' '}
                          <strong className="text-zinc-900">
                            {formatRupiah(item.menuItem.price * item.qty)}
                          </strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          aria-label="Kurangi jumlah"
                          onClick={() => onUpdateQty(item.menuItem.id, -1, item.note)}
                          className="w-7 h-7 rounded-md border border-zinc-200 flex items-center justify-center text-zinc-700 hover:bg-zinc-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-semibold tabular-nums">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          aria-label="Tambah jumlah"
                          onClick={() => onUpdateQty(item.menuItem.id, 1, item.note)}
                          className="w-7 h-7 rounded-md border border-zinc-200 flex items-center justify-center text-zinc-700 hover:bg-zinc-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          aria-label="Hapus item"
                          onClick={() => onRemoveItem(item.menuItem.id, item.note)}
                          className="w-7 h-7 rounded-md text-zinc-400 hover:text-red-600 flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer & Table Details */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Data Pemesan & Meja
                </h3>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Meja / Jenis Layanan
                  </label>
                  <select
                    value={selectedTableCode}
                    onChange={(e) => onSelectTableCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D7A6F]/30"
                  >
                    {qrTables
                      .filter((t) => t.isActive)
                      .map((t) => (
                        <option key={t.id} value={t.code}>
                          {t.label} · {t.area}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Nama Pemesan *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={LIMITS.ALIAS_MAX}
                      value={customerAlias}
                      onChange={(e) => setCustomerAlias(e.target.value)}
                      placeholder="Contoh: Rina"
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D7A6F]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      No. WhatsApp *
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength={LIMITS.PHONE_MAX}
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="0812xxxxxxxx"
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D7A6F]/30"
                    />
                  </div>
                </div>

                {orderType === 'delivery' && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Alamat Pengantaran *
                    </label>
                    <textarea
                      required
                      rows={2}
                      maxLength={LIMITS.DELIVERY_ADDR_MAX}
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Nama jalan, nomor rumah, patokan..."
                      className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D7A6F]/30"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Catatan Pesanan (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.NOTES_MAX}
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Contoh: Alat makan 2 set, pisahkan kuah..."
                    className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D7A6F]/30"
                  />
                </div>
              </div>

              {/* Integrated Payment Method Selection */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Pilih Metode Pembayaran
                </h3>
                <div className="space-y-2">
                  {storeConfig.enabledPayments.map((method) => {
                    const meta = PAYMENT_METHOD_META[method];
                    const selected = paymentMethod === method;
                    return (
                      <label
                        key={method}
                        className={`flex items-start gap-3 p-3.5 border rounded-xl cursor-pointer transition-colors ${
                          selected
                            ? 'border-[#5C3A21] bg-[#F3ECE4]/65'
                            : 'border-zinc-200 bg-white hover:bg-zinc-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={method}
                          checked={selected}
                          onChange={() => setPaymentMethod(method)}
                          className="mt-1 accent-[#0D7A6F]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {method === 'qris' && <QrCode className="w-4 h-4 text-[#5C3A21] shrink-0" />}
                            {method === 'va_bank' && <CreditCard className="w-4 h-4 text-[#5C3A21] shrink-0" />}
                            {method === 'ewallet' && <Wallet className="w-4 h-4 text-[#5C3A21] shrink-0" />}
                            {method === 'cashier' && <Store className="w-4 h-4 text-[#5C3A21] shrink-0" />}
                            <span className="text-sm font-semibold text-[#2B1D14]">{meta.label}</span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">{meta.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Totals */}
              <div className="bg-[#FAF7F2] border border-stone-200 rounded-2xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal Menu</span>
                  <span className="font-mono tabular-nums">{formatRupiah(subtotal)}</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>Pajak Resto ({storeConfig.taxPercent}%)</span>
                  <span className="font-mono tabular-nums">{formatRupiah(taxAmount)}</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>Biaya Layanan</span>
                  <span className="font-mono tabular-nums">{formatRupiah(serviceFee)}</span>
                </div>
                <div className="flex justify-between font-bold text-base text-[#2B1D14] pt-2 border-t border-stone-200">
                  <span>Total Bayar</span>
                  <span className="font-mono tabular-nums text-[#5C3A21]">
                    {formatRupiah(totalAmount)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-stone-500">
                <ShieldCheck className="w-4 h-4 text-[#0D7A6F] shrink-0" />
                <span>Nomor WhatsApp & alamat Anda dilindungi dan hanya dapat dilihat oleh kasir.</span>
              </div>
            </form>
          )}
        </div>

        {/* Drawer Footer CTA */}
        {step === 'cart' && cart.length > 0 && (
          <div className="p-6 border-t border-zinc-200 bg-white">
            <button
              type="submit"
              form="checkout-form"
              disabled={submitting || !storeConfig.isOpen}
              className="w-full py-3.5 px-5 bg-[#0D7A6F] text-white text-sm font-semibold rounded-xl hover:bg-[#095E55] disabled:bg-zinc-300 disabled:text-zinc-500 transition-colors tabular-nums"
            >
              {!storeConfig.isOpen
                ? 'Toko Sedang Tutup'
                : submitting
                  ? 'Membuat Pesanan...'
                  : `Buat Pesanan · ${formatRupiah(totalAmount)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
