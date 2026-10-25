-- Agents (your customers)
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'starter',
  subscription_status TEXT DEFAULT 'trialing',
  trial_ends_at INTEGER,
  payment_provider TEXT, -- 'razorpay', 'paypal'
  payment_customer_id TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Forms (each agent can have many)
CREATE TABLE forms (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  template_id TEXT,
  crm_type TEXT NOT NULL,
  crm_config TEXT NOT NULL,
  settings TEXT DEFAULT '{}',
  is_active INTEGER DEFAULT 1,
  views INTEGER DEFAULT 0,
  submissions INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Form submissions (lead capture)
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  lead_data TEXT,
  crm_response TEXT,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  delivered_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- CRM webhook logs (audit trail)
CREATE TABLE webhook_logs (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  crm_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  response TEXT,
  status_code INTEGER,
  success INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Team members (Pro/Team plans)
CREATE TABLE team_members (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'agent',
  routing_weight INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(agent_id, email)
);

-- API keys (for embed script)
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  name TEXT,
  last_used_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Payment providers configuration
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
  paid_at INTEGER
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

-- Indexes for scale
CREATE INDEX idx_forms_agent ON forms(agent_id);
CREATE INDEX idx_forms_slug ON forms(slug);
CREATE INDEX idx_submissions_form ON submissions(form_id);
CREATE INDEX idx_submissions_agent ON submissions(agent_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_webhook_logs_form ON webhook_logs(form_id);
CREATE INDEX idx_team_members_agent ON team_members(agent_id);
CREATE INDEX idx_api_keys_agent ON api_keys(agent_id);
CREATE INDEX idx_payment_orders_agent ON payment_orders(agent_id);
CREATE INDEX idx_payment_orders_provider ON payment_orders(provider);
CREATE INDEX idx_payment_orders_status ON payment_orders(status);
CREATE INDEX idx_payment_webhooks_provider ON payment_webhooks(provider);
CREATE INDEX idx_payment_webhooks_processed ON payment_webhooks(processed);
CREATE INDEX idx_subscriptions_agent ON subscriptions(agent_id);
CREATE INDEX idx_subscriptions_provider ON subscriptions(provider);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
