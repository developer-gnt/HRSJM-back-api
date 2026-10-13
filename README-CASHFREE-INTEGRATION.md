# HRSJM Cashfree Backend Integration Guide

## Overview
This module (`CashfreeModule`) provides a secure, idempotent, server-verified Cashfree Payment Gateway integration for the HRSJM platform, supporting both **Donation Payments** and **Membership Payments**.

---

## Architecture & Production Safeguards Implemented

1. **Server-Side Truth**:
   The client only passes the payment purpose (`donation` or `membership`) and the internal reference UUID (`reference_id`). The server securely fetches the authoritative payment record, validates ownership, and calculates the exact INR amount.
   
2. **Official PG SDK Contract**:
   When `/api/v1/payments/cashfree/orders` is called, the backend returns:
   ```json
   {
     "order_id": "hrsjm_don_...",
     "payment_session_id": "session_...",
     "cf_order_id": 1234567,
     "order_status": "ACTIVE",
     "amount": 500.00,
     "currency": "INR",
     "purpose": "donation",
     "reference_id": "..."
   }
   ```
   This session ID is directly passed to the official React Native Cashfree PG SDK checkout.

3. **Multi-Attempt Server-Side Verification**:
   Verification does NOT trust client success claims or simple order lookups. It calls Cashfree's `/orders/{order_id}/payments` endpoint and verifies that:
   - At least one attempt has `payment_status === 'SUCCESS'`.
   - The verified attempt amount matches the database record (`paidAmount === expectedAmount`).
   - The currency is `INR`.
   - On verification, it delegates to `DonationPaymentsService.verify()` or `MembershipPaymentsService.verify()`, maintaining atomicity, double-entry accounting records, and receipt generation.

4. **Timing-Safe HMAC Webhook Verification**:
   - Webhooks are received on `POST /api/v1/payments/cashfree/webhook`.
   - The raw request body buffer (`req.rawBody`) is verified with `crypto.createHmac('sha256', secret)`.
   - Buffer length is compared prior to executing `crypto.timingSafeEqual` to prevent timing leak attacks.

5. **Double Accounting & Replay Prevention**:
   - Idempotency guards in both services ensure duplicate webhooks or concurrent verification calls return existing states safely without creating duplicate receipts, double-posting journal entries, or altering membership status twice.
   - Idempotency key header (`x-idempotency-key`) supported on order creation.

6. **Network Timeout & Delayed State Safety**:
   - Unknown, in-progress, or timed-out orders remain in `PENDING` status until verified.

---

## Endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/payments/cashfree/orders` | Bearer JWT | Initiates Cashfree order and returns `payment_session_id` |
| `GET` | `/api/v1/payments/cashfree/orders/:orderId/verify` | Bearer JWT | Server-side verification of payment attempts |
| `POST` | `/api/v1/payments/cashfree/webhook` | Public (HMAC Verified) | Asynchronous webhook notifications from Cashfree |

---

## Environment Configuration

Configure the following variables in your `.env`:
```env
CASHFREE_APP_ID=TEST_YOUR_APP_ID
CASHFREE_SECRET_KEY=TEST_YOUR_SECRET_KEY
CASHFREE_API_VERSION=2023-08-01
CASHFREE_ENV=SANDBOX # or PRODUCTION
CASHFREE_WEBHOOK_SECRET=your_webhook_signing_secret
CASHFREE_RETURN_URL=https://hrsjm.org/payments/callback?order_id={order_id}
CASHFREE_WEBHOOK_URL=https://api.hrsjm.org/api/v1/payments/cashfree/webhook
CASHFREE_API_TIMEOUT_MS=10000
```
