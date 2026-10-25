import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { verify } from 'hono/jwt'
import { getProvider, getAvailableProviders } from './payments'
import type { Env } from '../types/env'

const paymentRoutes = new Hono<{ Bindings: Env }>()

// Auth middleware
async function requireAuth(c: any, next: any) {
  const token = c.req.header('Cookie')?.split('auth_token=')[1]?.split(';')[0]
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    c.set('agentId', payload.agentId)
    c.set('agentEmail', payload.email)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
}

// ============================================
// GET AVAILABLE PROVIDERS
// ============================================
paymentRoutes.post('/providers', requireAuth, zValidator('json', z.object({
  country: z.string().length(2),
  currency: z.enum(['INR', 'USD']),
})), async (c) => {
  const { country, currency } = c.req.valid('json')
  const providers = getAvailableProviders(country, currency)
  return c.json({ providers })
})

// ============================================
// CREATE PAYMENT ORDER
// ============================================
paymentRoutes.post('/order', requireAuth, zValidator('json', z.object({
  provider: z.enum(['razorpay', 'paypal']),
  plan: z.enum(['starter', 'pro', 'team']),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  currency: z.enum(['INR', 'USD']),
  idempotencyKey: z.string().optional(),
})), async (c) => {
  const agentId = c.get('agentId')
  const { provider: providerName, plan, billingCycle, currency, idempotencyKey } = c.req.valid('json')
  const { DB, APP_URL, APP_NAME } = c.env

  const provider = getProvider(c.env, providerName)

  // Pricing
  const prices: Record<string, Record<string, { INR: number; USD: number }>> = {
    starter: { monthly: { INR: 249900, USD: 2900 }, yearly: { INR: 2499000, USD: 29000 } },
    pro: { monthly: { INR: 699900, USD: 7900 }, yearly: { INR: 6999000, USD: 79000 } },
    team: { monthly: { INR: 1699900, USD: 19900 }, yearly: { INR: 16999000, USD: 199000 } },
  }

  const amount = prices[plan]?.[billingCycle]?.[currency as keyof typeof prices.starter.monthly]
  if (!amount) {
    return c.json({ error: 'Invalid plan or currency' }, 400)
  }

  const finalIdempotencyKey = idempotencyKey || `order_${crypto.randomUUID()}`
  
  // Check for existing order with same idempotency key
  const existing = await DB.prepare('SELECT * FROM payment_orders WHERE idempotency_key = ?').bind(finalIdempotencyKey).first()
  if (existing) {
    return c.json({ orderId: existing.provider_order_id, amount: existing.amount, currency: existing.currency })
  }

  const orderParams = {
    amount,
    currency: currency as 'INR' | 'USD',
    plan,
    billingCycle,
    agentId,
    idempotencyKey: finalIdempotencyKey,
    metadata: { appUrl: APP_URL, appName: APP_NAME },
  }

  const orderResult = await getProvider(c.env, providerName).createOrder(orderParams)

  // Save order
  const orderId = crypto.randomUUID()
  const now = Date.now()
  await DB.prepare(`
    INSERT INTO payment_orders (id, agent_id, provider, provider_order_id, amount, currency, status, plan, billing_cycle, metadata, idempotency_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?, ?)
  `).bind(
    orderId, agentId, providerName, orderResult.orderId, amount, currency, plan, billingCycle,
    JSON.stringify({ appUrl: APP_URL, appName: APP_NAME }), finalIdempotencyKey, now, now
  ).run()

  return c.json({
    orderId: orderResult.orderId,
    amount: orderResult.amount,
    currency: orderResult.currency,
    checkoutUrl: orderResult.checkoutUrl,
    razorpayKeyId: orderResult.razorpayKeyId,
  })
})

// ============================================
// VERIFY PAYMENT
// ============================================
paymentRoutes.post('/verify', requireAuth, zValidator('json', z.object({
  provider: z.enum(['razorpay', 'paypal']),
  orderId: z.string(),
  paymentId: z.string(),
  signature: z.string().optional(), // Razorpay
  payerId: z.string().optional(), // PayPal
})), async (c) => {
  const agentId = c.get('agentId')
  const { provider: providerName, orderId, paymentId, signature, payerId } = c.req.valid('json')
  const { DB } = c.env

  const provider = getProvider(c.env, providerName)
  const result = await provider.verifyPayment({ provider: providerName, orderId, paymentId, signature, payerId })

  if (result.success) {
    // Update order status
    await DB.prepare('UPDATE payment_orders SET status=?, paid_at=?, updated_at=? WHERE provider_order_id=?')
      .bind('paid', Date.now(), Date.now(), orderId).run()

    // Verify agent owns this order
    const order = await DB.prepare('SELECT * FROM payment_orders WHERE provider_order_id = ?').bind(orderId).first()
    if (order && order.agent_id === agentId) {
      return c.json({ success: true, orderId, paymentId, amount: result.amount, currency: result.currency })
    }
  }

  return c.json({ success: false, error: result.error || 'Verification failed' }, 400)
})

// ============================================
// CREATE SUBSCRIPTION
// ============================================
paymentRoutes.post('/subscription', requireAuth, zValidator('json', z.object({
  provider: z.enum(['razorpay', 'paypal']),
  plan: z.enum(['starter', 'pro', 'team']),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  currency: z.enum(['INR', 'USD']),
})), async (c) => {
  const agentId = c.get('agentId')
  const { provider: providerName, plan, billingCycle, currency } = c.req.valid('json')
  const { DB } = c.env

  const agent = await DB.prepare('SELECT payment_customer_id FROM agents WHERE id = ?').bind(agentId).first()
  if (!agent) return c.json({ error: 'Agent not found' }, 404)

  const provider = getProvider(c.env, providerName)
  const result = await provider.createSubscription({
    amount: 0, // determined by plan
    currency,
    plan,
    billingCycle,
    agentId,
    customerId: agent.payment_customer_id || '',
    metadata: { appUrl: c.env.APP_URL, appName: c.env.APP_NAME },
  })

  return c.json(result)
})

// ============================================
// CANCEL SUBSCRIPTION
// ============================================
paymentRoutes.post('/cancel', requireAuth, zValidator('json', z.object({
  provider: z.enum(['razorpay', 'paypal']),
  subscriptionId: z.string(),
})), async (c) => {
  const agentId = c.get('agentId')
  const { provider: providerName, subscriptionId } = c.req.valid('json')
  const { DB } = c.env

  // Verify ownership
  const sub = await DB.prepare('SELECT * FROM subscriptions WHERE provider_subscription_id = ? AND agent_id = ?')
    .bind(subscriptionId, agentId).first()
  if (!sub) return c.json({ error: 'Subscription not found' }, 404)

  const provider = getProvider(c.env, providerName)
  await provider.cancelSubscription(subscriptionId)

  await DB.prepare('UPDATE subscriptions SET status=?, cancelled_at=?, updated_at=? WHERE id=?')
    .bind('cancelled', Date.now(), Date.now(), sub.id).run()

  await DB.prepare('UPDATE agents SET plan=?, subscription_status=?, updated_at=? WHERE id=?')
    .bind('starter', 'cancelled', Date.now(), agentId).run()

  return c.json({ success: true })
})

// ============================================
// PAYMENT HISTORY
// ============================================
paymentRoutes.get('/history', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const { DB } = c.env

  const orders = await DB.prepare(`
    SELECT * FROM payment_orders WHERE agent_id = ? ORDER BY created_at DESC LIMIT 50
  `).bind(agentId).all()

  const subscriptions = await DB.prepare(`
    SELECT * FROM subscriptions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 20
  `).bind(agentId).all()

  return c.json({ orders: orders.results || [], subscriptions: subscriptions.results || [] })
})

// ============================================
// CURRENT SUBSCRIPTION STATUS
// ============================================
paymentRoutes.get('/subscription', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const { DB } = c.env

  const agent = await DB.prepare('SELECT plan, subscription_status, payment_provider, payment_customer_id, trial_ends_at FROM agents WHERE id = ?').bind(agentId).first()
  const sub = await DB.prepare('SELECT * FROM subscriptions WHERE agent_id = ? AND status IN (?, ?, ?) ORDER BY created_at DESC LIMIT 1')
    .bind(agentId, 'active', 'trialing', 'past_due').first()

  return c.json({ agent, subscription: sub })
})

export default paymentRoutes