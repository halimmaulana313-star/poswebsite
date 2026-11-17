/**
 * Payload-First Security Verification Suite for SajiLokal Firestore Rules.
 * Covers the Dirty Dozen adversarial test cases against firestore.rules.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list';
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
  guardEnforced: string;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Order Create',
    collectionPath: '/orders/ord_test_01',
    operation: 'create',
    payload: { orderCode: 'ORD-1001', isAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: 'data.keys().hasOnly([...])',
  },
  {
    id: 2,
    name: 'Pre-Paid / Pre-Completed Order Spoofing',
    collectionPath: '/orders/ord_test_02',
    operation: 'create',
    payload: { paymentStatus: 'paid', orderStatus: 'completed' },
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: "data.paymentStatus == 'unpaid' && data.orderStatus == 'new'",
  },
  {
    id: 3,
    name: 'Negative Total Amount Tampering',
    collectionPath: '/orders/ord_test_03',
    operation: 'create',
    payload: { subtotal: -50000, totalAmount: -1000 },
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: 'data.subtotal > 0 && data.totalAmount > 0',
  },
  {
    id: 4,
    name: 'Client Timestamp Forgery',
    collectionPath: '/orders/ord_test_04',
    operation: 'create',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: 'incoming().createdAt == request.time',
  },
  {
    id: 5,
    name: 'Path Variable ID Poisoning',
    collectionPath: '/orders/' + 'x'.repeat(200),
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: 'isValidId(orderId)',
  },
  {
    id: 6,
    name: 'Unbounded Items Array Attack',
    collectionPath: '/orders/ord_test_06',
    operation: 'create',
    payload: { items: Array.from({ length: 40 }, () => ({ menuItemId: 'm1', name: 'X', price: 1000, qty: 1 })) },
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: 'data.items.size() >= 1 && data.items.size() <= 25',
  },
  {
    id: 7,
    name: 'Non-Admin Menu Tampering',
    collectionPath: '/menu_items/item_01',
    operation: 'update',
    payload: { price: 1 },
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: 'isAdmin()',
  },
  {
    id: 8,
    name: 'Non-Admin Payment Account Hijack',
    collectionPath: '/store_config/main',
    operation: 'update',
    payload: { bankAccountNumber: '9999999999' },
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: 'isAdmin()',
  },
  {
    id: 9,
    name: 'Customer TotalAmount Update During Payment Confirmation',
    collectionPath: '/orders/ord_test_09',
    operation: 'update',
    payload: { paymentStatus: 'verifying', totalAmount: 100 },
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: "affectedKeys().hasOnly(['paymentStatus', 'paymentRef', 'updatedAt'])",
  },
  {
    id: 10,
    name: 'Terminal State Resurrection',
    collectionPath: '/orders/ord_completed_10',
    operation: 'update',
    payload: { paymentStatus: 'verifying' },
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: "!(existing().orderStatus in ['completed', 'cancelled'])",
  },
  {
    id: 11,
    name: 'PII Contact Scrape by Non-Owner',
    collectionPath: '/orders/ord_test_11/private/contact',
    operation: 'get',
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: 'isAdmin() || (isSignedIn() && existing().customerUid == request.auth.uid)',
  },
  {
    id: 12,
    name: 'Unverified Email Admin Spoof',
    collectionPath: '/admins/fake_admin',
    operation: 'create',
    expectedResult: 'PERMISSION_DENIED',
    guardEnforced: 'request.auth.token.email_verified == true',
  },
];
