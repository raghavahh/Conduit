# Conduit Payment Migration Plan: Stripe → Razorpay + PayPal

## Executive Summary
Remove Stripe entirely. Implement Razorpay (INR/India) + PayPal (International) with provider-independent interface. Server-side verification, idempotent webhooks, customer choice at checkout.

---

## Phase 1: Audit & Remove Stripe (COMPLETE - Found 7 references)

### Files to Modify:
1. `package.json` - Remove stripe dependency + scripts
2. `BACKEND/index.ts` - Remove Stripe webhook route
3. `FRONTEND/admin.ts` - Remove Stripe billing page/checkout
4. `BACKEND/auth.ts` - Remove stripe_customer_id, stripe_subscription_id references
5. `FRONTEND/auth.ts` - Same
6. `DB/schema.sql` - Remove stripe columns from agents table
7. `scripts/deploy.sh` - Remove Stripe secret prompts
8. `README.md` - Update env vars documentation

---

## Phase 2: Database Schema Updates

### New Tables:
```sql
-- Payment providers config
CREATE TABLE payment_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, -- 'razorpay', 'paypal'
  display_name TEXT NOT NULL,
  supported_currencies TEXT NOT NULL, -- JSON array ['INR', 'USD']
  supported_countries TEXT NOT NULL, -- JSON array ['IN', 'US', ...]
  is_active INTEGER DEFAULT 1,
  config TEXT NOT NULL, -- JSON: api keys, webhook secrets, etc.
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Payment orders (provider-agnostic)
CREATE TABLE payment_orders (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'razorpay', 'paypal'
  provider_order_id TEXT, -- Razorpay order_id / PayPal order_id
  amount INTEGER NOT NULL, -- in smallest currency unit (paise for INR, cents for USD)
  currency TEXT NOT NULL, -- 'INR', 'USD'
  status TEXT DEFAULT 'created', -- created, attempted, paid, failed, refunded, cancelled
  plan TEXT NOT NULL, -- 'starter', 'pro', 'team'
  billing_cycle TEXT DEFAULT 'monthly', -- monthly, yearly
  metadata TEXT, -- JSON for additional data
  idempotency_key TEXT UNIQUE,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  paid_at INTEGER,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Payment webhooks log (idempotency)
CREATE TABLE payment_webhooks (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  signature TEXT,
  processed INTEGER DEFAULT 0,
  processed_at INTEGER,
  error TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Subscription records (provider-agnostic)
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subscription_id TEXT,
  provider_customer_id TEXT,
  plan TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active, past_due, cancelled, expired, trialing
  current_period_start INTEGER,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER DEFAULT 0,
  cancelled_at INTEGER,
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Update agents table: remove Stripe columns, add provider fields
ALTER TABLE agents DROP COLUMN stripe_customer_id;
ALTER TABLE agents DROP COLUMN stripe_subscription_id;
ALTER TABLE agents ADD COLUMN payment_provider TEXT; -- 'razorpay', 'paypal'
ALTER TABLE agents ADD COLUMN payment_customer_id TEXT;
```

---

## Phase 3: Payment Provider Interface (Backend)

### File: `BACKEND/payments.ts`
```typescript
// Provider-agnostic interface
interface PaymentProvider {
  name: 'razorpay' | 'paypal';
  createOrder(params: OrderParams): Promise<OrderResult>;
  verifyPayment(params: VerifyParams): Promise<VerificationResult>;
  createSubscription(params: SubParams): Promise<SubResult>;
  cancelSubscription(subId: string): Promise<void>;
  verifyWebhook(payload: string, signature: string): boolean;
  parseWebhook(payload: any): WebhookEvent;
}

// Razorpay implementation
class RazorpayProvider implements PaymentProvider {
  name = 'razorpay' as const;
  private client: Razorpay;
  
  async createOrder(params) { ... }
  async verifyPayment(params) { ... }
  async createSubscription(params) { ... }
  verifyWebhook(payload, signature) { ... }
  parseWebhook(payload) { ... }
}

// PayPal implementation
class PayPalProvider implements PaymentProvider {
  name = 'paypal' as const;
  private client: PayPalClient;
  
  async createOrder(params) { ... }
  async verifyPayment(params) { ... }
  async createSubscription(params) { ... }
  verifyWebhook(payload, signature) { ... }
  parseWebhook(payload) { ... }
}

// Factory
function getProvider(name: string): PaymentProvider { ... }
```

---

## Phase 4: API Routes (Backend)

### New Routes in `BACKEND/payments.ts`:
```
POST   /api/payments/providers          # List available providers for customer
POST   /api/payments/order              # Create payment order
POST   /api/payments/verify             # Verify payment (client-side success)
POST   /api/payments/subscription       # Create subscription
POST   /api/payments/cancel             # Cancel subscription
GET    /api/payments/history            # Payment history
POST   /webhooks/razorpay               # Razorpay webhook
POST   /webhooks/paypal                 # PayPal webhook
```

### Webhook Security:
- Verify signatures server-side
- Idempotent processing (check payment_webhooks table)
- Handle: payment.captured, payment.failed, refund.processed, subscription.charged, subscription.cancelled
- Update subscriptions table, agents table, send emails

---

## Phase 5: Frontend Updates

### 1. Billing Page (`/dashboard/billing`)
- Show plan comparison with INR prices
- Provider selector: Razorpay (INR) | PayPal (USD)
- Show only providers available for customer's region
- Clear pricing: ₹2,499/mo (Razorpay INR) | $29/mo (PayPal USD)
- No auto-switching - customer chooses

### 2. Checkout Flow
```
1. Customer selects plan → clicks "Upgrade"
2. Frontend calls /api/payments/providers → gets available providers
3. Customer selects provider (Razorpay/PayPal)
4. Frontend calls /api/payments/order with provider + plan
5. Redirect to provider checkout (Razorpay modal / PayPal redirect)
6. On success → provider redirects to /dashboard/billing?success=1&order_id=xxx
7. Frontend calls /api/payments/verify to confirm server-side
8. On verified → update UI, show success toast
```

### 3. Provider Selection Logic
```typescript
// Razorpay: Available for INR (India), USD if account approved
// PayPal: Available for international (non-INR)
function getAvailableProviders(country: string, currency: string): Provider[] {
  const providers = [];
  if (currency === 'INR' || country === 'IN') {
    providers.push({ id: 'razorpay', name: 'Razorpay', currency: 'INR', supported: true });
  }
  if (currency !== 'INR') {
    providers.push({ id: 'paypal', name: 'PayPal', currency: 'USD', supported: true });
  }
  // If INR but Razorpay USD not approved, don't show Razorpay USD
  return providers;
}
```

### 4. Pricing Display
| Plan | Razorpay (INR) | PayPal (USD) |
|------|---------------|-------------|
| Starter | ₹2,499/mo | $29/mo |
| Pro | ₹6,999/mo | $79/mo |
| Team | ₹16,999/mo | $199/mo |

---

## Phase 6: Dependencies & Config

### package.json additions:
```json
{
  "dependencies": {
    "razorpay": "^2.9.0",
    "@paypal/checkout-server-sdk": "^1.0.3",
    "paypal-rest-sdk": "^1.8.1"
  }
}
```

### New wrangler secrets:
```bash
wrangler secret put RAZORPAY_KEY_ID
wrangler secret put RAZORPAY_KEY_SECRET
wrangler secret put RAZORPAY_WEBHOOK_SECRET
wrangler secret put PAYPAL_CLIENT_ID
wrangler secret put PAYPAL_CLIENT_SECRET
wrangler secret put PAYPAL_WEBHOOK_ID
wrangler secret put PAYPAL_MODE  # sandbox|live
```

---

## Phase 7: Security & Reliability

### Webhook Processing (Idempotent):
```typescript
async function processWebhook(provider, payload, signature) {
  // 1. Verify signature
  if (!provider.verifyWebhook(payload, signature)) throw 401;
  
  // 2. Parse event
  const event = provider.parseWebhook(payload);
  
  // 3. Check idempotency
  const exists = await DB.prepare(
    'SELECT 1 FROM payment_webhooks WHERE provider=? AND event_type=? AND payload=?'
  ).bind(provider.name, event.type, JSON.stringify(payload)).first();
  if (exists) return { success: true, duplicate: true };
  
  // 4. Log webhook
  await DB.prepare(`
    INSERT INTO payment_webhooks (id, provider, event_type, payload, signature, processed, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).bind(crypto.randomUUID(), provider.name, event.type, JSON.stringify(payload), signature, Date.now()).run();
  
  // 4. Process event (in transaction)
  await processEvent(provider, event);
  
  // 5. Mark processed
  await DB.prepare('UPDATE payment_webhooks SET processed=1, processed_at=? WHERE provider=? AND event_type=? AND payload=?')
    .bind(Date.now(), provider.name, event.type, JSON.stringify(payload)).run();
}
```

### Event Handlers:
- `payment.captured` / `PAYMENT.CAPTURED` → Create subscription, update agent plan
- `payment.failed` / `PAYMENT.FAILED` → Log failure, notify agent
- `refund.processed` / `REFUND.COMPLETED` → Update subscription status
- `subscription.charged` / `BILLING.SUBSCRIPTION.CHARGED` → Renew subscription
- `subscription.cancelled` / `BILLING.SUBSCRIPTION.CANCELLED` → Downgrade agent

---

## Phase 8: Testing Checklist

- [ ] Razorpay INR checkout (sandbox)
- [ ] Razorpay USD checkout (if approved)
- [ ] PayPal USD checkout (sandbox)
- [ ] Provider selection shows correct options
- [ ] Webhook signature verification
- [ ] Idempotent webhook processing (duplicate webhooks)
- [ ] Failed payment handling
- [ ] Refund processing
- [ ] Subscription renewal
- [ ] Subscription cancellation
- [ ] Plan downgrade on cancellation
- [ ] Email notifications on payment events
- [ ] Dashboard shows correct plan/status

---

## Phase 9: Deployment Steps

1. Run DB migration
2. Deploy backend with new routes
3. Configure Razorpay webhook URL: `https://conduithq.io/webhooks/razorpay`
4. Configure PayPal webhook URL: `https://conduithq.io/webhooks/paypal`
5. Set all secrets via `wrangler secret put`
6. Test sandbox payments
7. Switch to live mode
8. Monitor webhook logs

---

## Files to Create/Modify Summary

### New Files:
- `BACKEND/payments.ts` - Payment provider interface + implementations
- `BACKEND/payment-webhooks.ts` - Webhook handlers
- `DB/migration_payment_v1.sql` - Migration script

### Modified Files:
- `package.json` - Remove stripe, add razorpay + paypal
- `DB/schema.sql` - Updated schema
- `BACKEND/index.ts` - Add payment routes
- `BACKEND/auth.ts` - Remove stripe fields
- `FRONTEND/auth.ts` - Remove stripe fields
- `FRONTEND/admin.ts` - New billing page with provider selection
- `FRONTEND/public.ts` - Update pricing display
- `scripts/deploy.sh` - New secret prompts
- `wrangler.toml` - New vars
- `README.md` - Updated docs
- `tsconfig.json` - If needed

---

## Verification Commands

```bash
# After deployment
curl -X POST https://conduithq.io/api/payments/providers -d '{"country":"IN","currency":"INR"}'
# Should return: [{"id":"razorpay","name":"Razorpay","currency":"INR"}]

curl -X POST https://conduithq.io/api/payments/order -d '{"provider":"razorpay","plan":"starter","currency":"INR"}'
# Should return Razorpay order_id

# Test webhook
curl -X POST https://conduithq.io/webhooks/razorpay \
  -H "X-Razorpay-Signature: <sig>" \
  -d '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_xxx","amount":249900,"currency":"INR"}}}}'
```

---

## Rollback Plan
If issues: Revert `package.json`, `DB/schema.sql`, `wrangler.toml`, redeploy. Stripe data preserved in backup migration.