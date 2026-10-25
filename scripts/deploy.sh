#!/bin/bash
set -e

echo "🚀 Conduit - Cloudflare Deployment Script"
echo "========================================="

# Check wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Installing wrangler..."
    npm install -g wrangler
fi

# Check if logged in
echo "Checking Cloudflare auth..."
wrangler whoami || { echo "Please run: wrangler login"; exit 1; }

# Create resources if they don't exist
echo "Creating Cloudflare resources..."

# D1 Database
echo "Creating D1 database..."
DB_OUTPUT=$(wrangler d1 create conduit-prod 2>&1 || true)
DB_ID=$(echo "$DB_OUTPUT" | grep -oE '[a-f0-9-]{36}' | head -1)
if [ -n "$DB_ID" ]; then
    echo "Database created: $DB_ID"
    sed -i "s/database_id = \"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\"/database_id = \"$DB_ID\"/" wrangler.toml
else
    echo "Database may already exist, checking..."
    DB_ID=$(wrangler d1 list | grep conduit-prod | awk '{print $2}')
    if [ -n "$DB_ID" ]; then
        echo "Found existing database: $DB_ID"
        sed -i "s/database_id = \"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\"/database_id = \"$DB_ID\"/" wrangler.toml
    fi
fi

# KV Namespace
echo "Creating KV namespace..."
KV_OUTPUT=$(wrangler kv namespace create KV --preview 2>&1 || true)
KV_ID=$(echo "$KV_OUTPUT" | grep -oE 'id = "[^"]*"' | head -1 | cut -d'"' -f2)
KV_PREVIEW_ID=$(echo "$KV_OUTPUT" | grep -oE'preview_id = "[^"]*"' | head -1 | cut -d'"' -f2)
if [ -n "$KV_ID" ]; then
    echo "KV namespace created: $KV_ID"
    sed -i "s/id = \"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\"/id = \"$KV_ID\"/" wrangler.toml
    sed -i "s/preview_id = \"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\"/preview_id = \"$KV_PREVIEW_ID\"/" wrangler.toml
fi

# R2 Bucket
echo "Creating R2 bucket..."
wrangler r2 bucket create conduit-assets 2>&1 || echo "Bucket may exist"

# Queues
echo "Creating queues..."
wrangler queues create webhook-delivery 2>&1 || echo "Queue may exist"
wrangler queues create email-delivery 2>&1 || echo "Queue may exist"

# Install dependencies
echo "Installing dependencies..."
npm install

# Run migrations
if [ -n "$DB_ID" ]; then
    echo "Running database migrations..."
    wrangler d1 execute conduit-prod --file=./DB/schema.sql --remote
fi

# Set secrets (interactive)
echo ""
echo "🔐 Setting secrets (you'll be prompted for each):"
echo "RESEND_API_KEY (get from resend.com)"
wrangler secret put RESEND_API_KEY

echo "RAZORPAY_KEY_ID (get from razorpay.com/dashboard)"
wrangler secret put RAZORPAY_KEY_ID

echo "RAZORPAY_KEY_SECRET (get from razorpay.com/dashboard)"
wrangler secret put RAZORPAY_KEY_SECRET

echo "RAZORPAY_WEBHOOK_SECRET (create in Razorpay Dashboard > Webhooks)"
wrangler secret put RAZORPAY_WEBHOOK_SECRET

echo "PAYPAL_CLIENT_ID (get from developer.paypal.com)"
wrangler secret put PAYPAL_CLIENT_ID

echo "PAYPAL_CLIENT_SECRET (get from developer.paypal.com)"
wrangler secret put PAYPAL_CLIENT_SECRET

echo "PAYPAL_WEBHOOK_ID (create in PayPal Developer Dashboard > Webhooks)"
wrangler secret put PAYPAL_WEBHOOK_ID

echo "PAYPAL_MODE (sandbox or live)"
wrangler secret put PAYPAL_MODE

echo "JWT_SECRET (generate with: openssl rand -hex 32)"
wrangler secret put JWT_SECRET

echo "CRM_WEBHOOK_SECRET (generate with: openssl rand -hex 32)"
wrangler secret put CRM_WEBHOOK_SECRET

# Deploy
echo ""
echo "🚀 Deploying to Cloudflare..."
wrangler deploy

echo ""
echo "✅ Deployment complete!"
echo "Your app is live at: https://conduithq.io (or your custom domain)"
echo ""
echo "Next steps:"
echo "1. Add custom domain in Cloudflare Dashboard > Workers > conduit > Triggers"
echo "2. Configure Razorpay webhook to: https://conduithq.io/webhooks/razorpay"
echo "3. Configure PayPal webhook to: https://conduithq.io/webhooks/paypal"
echo "4. Test form submission at: https://conduithq.io/forms/test-slug"
