# Conduit - Lead Capture Forms for Real Estate Agents

**Vertical SaaS for real estate agents** — Lead capture forms that connect to CRM (Follow Up Boss, LionDesk, kvCORE, HubSpot) in 5 minutes via webhook. No backend, no Zapier, no field mapping headaches.

## 🏗️ Architecture

- **Compute**: Cloudflare Workers (edge, auto-scales)
- **Database**: D1 (SQLite, 5GB free, 5M rows)
- **Cache/Sessions**: KV (1GB free)
- **Files**: R2 (10GB free)
- **Async/Queues**: Cloudflare Queues
- **Email**: Resend API (via Worker)
- **Auth**: JWT + Argon2id (Web Crypto API)
- **Payments**: Razorpay (INR/India) + PayPal (International)

**Cost at 50K users**: ~$10-20/mo (Workers $5, D1 $5, rest free tier)

## 🚀 Quick Start

```bash
# 1. Clone & enter
cd conduit

# 2. Install deps
npm install

# 3. Run deploy script (creates all Cloudflare resources)
chmod +x scripts/deploy.sh
./scripts/deploy.sh

# 4. Set secrets when prompted
# 5. Done! Live at https://conduithq.io
```

## 📁 Project Structure

```
conduit/
├── wrangler.toml          # Cloudflare config
├── package.json
├── tsconfig.json
├── BACKEND/               # Server-side logic
│   ├── index.ts           # Hono router (entry)
│   ├── payments.ts        # Payment provider interface + Razorpay/PayPal
│   ├── payment-webhooks.ts # Webhook handlers
│   ├── auth.ts            # Register/login/me
│   ├── admin.ts           # Dashboard API
│   ├── webhooks.ts        # CRM webhook receivers
│   ├── crm.ts             # CRM delivery + field maps
│   ├── email.ts           # Resend notifications
│   ├── scheduler.ts       # Showing scheduler + team routing
│   ├── queue.ts           # Queue processors
│   ├── validation.ts      # Zod schemas + templates
│   └── crypto.ts          # Hash, IDs, formatting
├── FRONTEND/              # Client-facing routes
│   ├── public.ts          # Landing page, templates
│   ├── forms.ts           # Form render + submit
│   ├── auth.ts            # Login / Register pages
│   ├── admin.ts           # Full admin dashboard
│   └── styles.css         # Design system
├── DB/                    # Database
│   ├── schema.sql         # D1 schema
│   └── migrations/        # Future migrations
├── scripts/
│   ├── deploy.sh          # Full deploy automation
│   └── migrate.sh         # DB migrations
└── public/                # Static assets (optional)
```

## 🔑 Environment Variables (wrangler secrets)

| Secret | Description | Source |
|--------|-------------|--------|
| `RESEND_API_KEY` | Email sending | resend.com |
| `RAZORPAY_KEY_ID` | Razorpay API key | razorpay.com |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | razorpay.com |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook verification | Razorpay Dashboard |
| `PAYPAL_CLIENT_ID` | PayPal client ID | developer.paypal.com |
| `PAYPAL_CLIENT_SECRET` | PayPal secret | developer.paypal.com |
| `PAYPAL_WEBHOOK_ID` | PayPal webhook ID | PayPal Developer Dashboard |
| `PAYPAL_MODE` | sandbox or live | — |
| `JWT_SECRET` | Auth tokens | `openssl rand -hex 32` |
| `CRM_WEBHOOK_SECRET` | CRM webhook signatures | `openssl rand -hex 32` |

## 📋 5 Built-in Templates

1. **Buyer Inquiry** — Property preferences, price range, timeline
2. **Seller Valuation (CMA)** — Address, property details, sell timeline
3. **Open House Sign-In** — Digital sign-in sheet with feedback
4. **Showing Request** — Calendar integration, preferred dates/times
5. **Referral Partner** — Lender, inspector, attorney referrals

## 🔗 CRM Field Mappings (Pre-configured)

- **Follow Up Boss** — Native field names
- **LionDesk** — snake_case fields
- **kvCORE** — CamelCase fields
- **HubSpot** — lowercase fields
- **Generic** — Pass-through

## 💰 Pricing

| Plan | Razorpay (INR) | PayPal (USD) | Features |
|------|---------------|-------------|----------|
| **Starter** | ₹2,499/mo | $29/mo | Unlimited forms, 4 CRMs, 5 templates, MLS disclaimer |
| **Pro** | ₹6,999/mo | $79/mo | + Showing scheduler, team routing (5 agents), custom redirects |
| **Team** | ₹16,999/mo | $199/mo | + 10 agents, weighted routing, team analytics |

**Founding 50 agents**: Lock in ₹2,499/mo ($29/mo) forever

## 🛠️ Development

```bash
# Local dev (uses local D1/KV/R2)
npm run dev

# Run migrations locally
npm run migrate:local

# Run migrations remote
npm run migrate

# Type check
npx tsc --noEmit
```

## 🧪 Testing Checklist

- [ ] Form renders at `/forms/:slug`
- [ ] Submission → webhook delivery → CRM creates lead
- [ ] Showing scheduler creates calendar event
- [ ] Team round-robin distributes leads
- [ ] MLS disclaimer appears per state
- [ ] Email notification sent on submission
- [ ] Razorpay INR checkout → subscription created
- [ ] PayPal USD checkout → subscription created
- [ ] Trial ending emails at 7/3/1 days
- [ ] Webhook signature verification
- [ ] Idempotent webhook processing (duplicate webhooks)
- [ ] Failed payment handling
- [ ] Subscription renewal
- [ ] Subscription cancellation

## 📊 Monitoring

- **Workers Analytics**: Built-in (10M events/mo free)
- **Logs**: `wrangler tail`
- **D1 Queries**: Cloudflare Dashboard > D1
- **Queue Metrics**: Dashboard > Queues
- **Payment Webhooks**: Dashboard > D1 > payment_webhooks table

## 🔒 Security

- Argon2id password hashing (Web Crypto API)
- JWT auth (HS256, 7-day expiry)
- HMAC-SHA256 webhook signatures (Razorpay + PayPal)
- CSP headers, CORS configured
- Rate limiting via KV (100 req/min/IP)
- Idempotent webhook processing (prevents duplicate charges)
- Server-side payment verification (never trust client)

## 📈 Scaling to 50K+ Users

| Component | Free Tier | 50K Users |
|-----------|-----------|-----------|
| Workers | 100K req/day | $5/mo (10M req) |
| D1 | 5GB, 5M rows | $5/mo (10GB) |
| KV | 1GB, 100K ops/day | Free |
| R2 | 10GB, 1M ops/mo | Free |
| Queues | 1M msgs/mo | Free |

**No infrastructure changes needed** — Cloudflare handles scaling automatically.

## 🚢 Deploy to Production

```bash
# 1. Set production secrets
wrangler secret put RESEND_API_KEY --env production
wrangler secret put RAZORPAY_KEY_ID --env production
wrangler secret put RAZORPAY_KEY_SECRET --env production
# ... etc

# 2. Deploy
wrangler deploy --env production

# 3. Add custom domain
# Cloudflare Dashboard > Workers > conduit > Triggers > Custom Domains

# 4. Configure webhooks
# Razorpay: https://conduithq.io/webhooks/razorpay
# PayPal: https://conduithq.io/webhooks/paypal
```

## 📝 License

MIT — Build on top, sell it, modify it.
"# Conduit" 
