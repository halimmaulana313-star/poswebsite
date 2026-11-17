# Security Specification & Payload-First Security TDD

## 1. Data Invariants
1. **Default Deny**: All unmatched Firestore paths are denied by default.
2. **Catalog Integrity**: Only verified admin (`isAdmin()`) can create, modify, or delete `store_config`, `menu_items`, and `qr_tables`.
3. **Strict Schema & Boundary Enforcement**: Every document ID must match `^[a-zA-Z0-9_\-]+$` and stay within 128 characters. All string, number, and array fields have explicit type and upper-bound checks.
4. **PII Isolation**: Customer phone numbers and delivery addresses are stored exclusively in `/orders/{orderId}/private/contact` and can only be read by `isAdmin()` or the authenticated `customerUid` owner—never publicly readable or listable.
5. **Order Financial & State Integrity**: On order creation, `orderStatus` must start at `'new'`, `paymentStatus` must start at `'unpaid'`, `totalAmount` must be positive, and timestamps must match `request.time`.
6. **Action-Based Updates & Terminal State Locking**:
   - Non-admin customers can ONLY submit payment confirmation on an active `'unpaid'` order (`paymentStatus`: `'unpaid'` -> `'verifying'`), affecting strictly `['paymentStatus', 'paymentRef', 'updatedAt']`.
   - Orders in terminal states (`'completed'` or `'cancelled'`) cannot be modified by non-admins.
   - Only `isAdmin()` can transition `orderStatus` (`'new'` -> `'preparing'` -> `'ready'` -> `'completed'` / `'cancelled'`) or mark `paymentStatus: 'paid'`.
7. **No Unauthenticated Query Scraping**: `allow list` on `orders` is strictly restricted to `isAdmin()` or authenticated `resource.data.customerUid == request.auth.uid`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on Order Create**: `{ ..., isAdmin: true, discountOverride: 999999 }` -> Rejected by `keys().hasOnly(...)`.
2. **Pre-Paid / Pre-Completed Order Spoofing**: `{ ..., paymentStatus: "paid", orderStatus: "completed" }` -> Rejected because creation enforces `paymentStatus == "unpaid"` and `orderStatus == "new"`.
3. **Negative Price / Financial Tampering**: `{ ..., subtotal: -50000, totalAmount: -1000 }` -> Rejected by numeric bounds (`subtotal > 0`, `totalAmount > 0`).
4. **Client Timestamp Forgery**: `{ ..., createdAt: "2020-01-01T00:00:00Z" }` -> Rejected by `createdAt == request.time`.
5. **Path Variable Poisoning**: Document ID > 128 chars or containing invalid symbols (`../admin`) -> Rejected by `isValidId(id)`.
6. **Unbounded Array / DoW Attack**: `items` array with 100 items or empty `items: []` -> Rejected by `items.size() >= 1 && items.size() <= 25`.
7. **Non-Admin Menu Tampering**: Authenticated non-admin attempting `write` on `/menu_items/item1` -> Rejected by `isAdmin()`.
8. **Non-Admin Store Config Hijack**: Authenticated non-admin attempting to swap `qrisNmid` or `bankAccountNumber` in `/store_config/main` -> Rejected by `isAdmin()`.
9. **Customer Price Update Attack**: Attempting to update `totalAmount` during payment confirmation -> Rejected by `affectedKeys().hasOnly(['paymentStatus', 'paymentRef', 'updatedAt'])`.
10. **Terminal State Resurrection**: Attempting to reopen an order where `existing().orderStatus == 'completed'` as non-admin -> Rejected by terminal lock.
11. **PII Blanket Read / Scrape**: Unauthenticated or non-owner attempting `get` or `list` on `/orders/{orderId}/private/contact` -> Rejected by `isAdmin() || isOrderOwner`.
12. **Unverified Admin Email Spoof**: Token with `email == 'halimmaulana313@gmail.com'` but `email_verified == false` -> Rejected by `request.auth.token.email_verified == true`.
