import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { verify } from 'hono/jwt'
import { getProvider, PaymentProvider, WebhookEvent } from './payments'
import { EmailService } from './email'
import type { Env } from '../types/env'

const paymentWebhooks = new Hono<{ Bindings: Env }>()

// HMAC-SHA256 via Web Crypto (Cloudflare Workers compatible)
async function hmacSha256(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// PayPal webhook signature verification via PayPal's verify-webhook-signature API
async function verifyPayPalSignature(env: Env, headers: Record<string, string>, body: string): Promise<boolean> {
  try {
    const base = env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

    // Get access token
    const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    if (!tokenRes.ok) return false
    const { access_token } = await tokenRes.json() as { access_token: string }

    // Verify webhook signature
    const verifyRes = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo: headers['paypal-auth-algo'] || '',
        cert_url: headers['paypal-cert-url'] || '',
        transmission_id: headers['paypal-transmission-id'] || '',
        transmission_sig: headers['paypal-transmission-sig'] || '',
        transmission_time: headers['paypal-transmission-time'] || '',
        webhook_id: env.PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(body),
      }),
    })
    if (!verifyRes.ok) return false
    const result = await verifyRes.json() as { verification_status: string }
    return result.verification_status === 'SUCCESS'
  } catch (err) {
    console.error('PayPal signature verification error:', err)
    return false
  }
}

// ============================================
// RAZORPAY WEBHOOK
// ============================================
paymentWebhooks.post('/razorpay', async (c) => {
  const { DB, RAZORPAY_WEBHOOK_SECRET } = c.env
  const signature = c.req.header('x-razorpay-signature')
  const body = await c.req.text()

  // Verify signature (HMAC-SHA256 via Web Crypto)
  const expectedSig = await hmacSha256(RAZORPAY_WEBHOOK_SECRET, body)
  if (signature !== expectedSig) {
    console.error('Razorpay webhook: Invalid signature')
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const payload = JSON.parse(body)
  return await processRazorpayWebhook(c, payload)
})

async function processRazorpayWebhook(c: any, payload: any) {
  const { DB, RAZORPAY_WEBHOOK_SECRET, APP_URL, APP_NAME } = c.env
  const provider = getProvider(c.env, 'razorpay')
  const event = payload.event
  const entity = payload.payload?.payment?.entity || payload.payload?.subscription?.entity

  // Log webhook (idempotency)
  const webhookId = crypto.randomUUID()
  await DB.prepare(`
    INSERT INTO payment_webhooks (id, provider, event_type, payload, signature, processed, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).bind(webhookId, 'razorpay', event, JSON.stringify(payload), '', Date.now()).run()

  // Check idempotency
  const existing = await DB.prepare(`
    SELECT 1 FROM payment_webhooks WHERE provider='razorpay' AND event_type=? AND payload=? AND processed=1
  `).bind(event, JSON.stringify(payload)).first()
  if (existing) {
    return c.json({ received: true, duplicate: true })
  }

  let processed = false
  let error: string | null = null

  try {
    if (event === 'payment.captured') {
      await handlePaymentCaptured(c, payload, entity)
      processed = true
    } else if (event === 'payment.failed') {
      await handlePaymentFailed(c, payload, entity)
      processed = true
    } else if (event === 'subscription.charged') {
      await handleSubscriptionCharged(c, payload, entity)
      processed = true
    } else if (event === 'subscription.cancelled') {
      await handleSubscriptionCancelled(c, payload, entity)
      processed = true
    } else if (event === 'refund.processed') {
      await handleRefundProcessed(c, payload, entity)
      processed = true
    }
  } catch (err) {
    error = String(err)
    console.error('Razorpay webhook processing error:', err)
  }

  // Mark processed
  await DB.prepare(`
    UPDATE payment_webhooks SET processed=?, processed_at=?, error=? WHERE id=?
  `).bind(processed ? 1 : 0, Date.now(), error, webhookId).run()

  return c.json({ received: true, processed })
}

async function handlePaymentCaptured(c: any, payload: any, entity: any) {
  const { DB, APP_URL, APP_NAME } = c.env
  const paymentId = entity.id
  const orderId = entity.order_id
  const amount = entity.amount
  const currency = entity.currency

  // Find order in our system
  const order = await DB.prepare('SELECT * FROM payment_orders WHERE provider_order_id = ?').bind(entity.order_id).first()
  if (!order) {
    console.warn('Razorpay: Order not found for payment', paymentId)
    return
  }

  // Update order
  await DB.prepare(`
    UPDATE payment_orders SET status='paid', paid_at=?, updated_at=? WHERE id=?
  `).bind(Date.now(), Date.now(), order.id).run()

  // Create subscription record
  const subId = crypto.randomUUID()
  const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(order.agent_id).first()
  const now = Date.now()
  const periodEnd = Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days

  await DB.prepare(`
    INSERT INTO subscriptions (id, agent_id, provider, provider_subscription_id, provider_customer_id, plan, status, current_period_start, current_period_end, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `).bind(subId, order.agent_id, 'razorpay', entity.id, entity.email || '', order.plan, 'active', now, now + 30*24*60*60*1000, now, now).run()

  // Update agent
  await DB.prepare(`
    UPDATE agents SET plan=?, subscription_status='active', payment_provider='razorpay', payment_customer_id=?, updated_at=? WHERE id=?
  `).bind(order.plan, entity.email || '', Date.now(), order.agent_id).run()

  // Send email
  if (agent?.email) {
    const emailService = new EmailService(c.env.RESEND_API_KEY)
    await emailService.sendLeadNotification(agent.email, 'Subscription Activated', {
      Plan: order.plan,
      Amount: `${(amount / 100).toFixed(2)} ${currency}`,
      Status: 'Active',
    })
  }
}

async function handlePaymentFailed(c: any, payload: any, entity: any) {
  const { DB } = c.env
  const paymentId = entity.id
  const orderId = entity.order_id

  const order = await DB.prepare('SELECT * FROM payment_orders WHERE provider_order_id = ?').bind(orderId).first()
  if (!order) return

  await DB.prepare('UPDATE payment_orders SET status=?, updated_at=? WHERE id=?').bind('failed', Date.now(), order.id).run()

  const agent = await DB.prepare('SELECT email FROM agents WHERE id = ?').bind(order.agent_id).first()
  if (agent?.email) {
    const emailService = new EmailService(c.env.RESEND_API_KEY)
    await emailService.sendLeadNotification(agent.email, 'Payment Failed', {
      Amount: `${(entity.amount / 100).toFixed(2)} ${entity.currency}`,
      Reason: entity.error_description || 'Unknown error',
    })
  }
}

async function handleSubscriptionCharged(c: any, payload: any, entity: any) {
  const { DB } = c.env
  const subId = entity.id

  // Find subscription
  const sub = await DB.prepare('SELECT * FROM subscriptions WHERE provider_subscription_id = ?').bind(subId).first()
  if (!sub) return

  const now = Date.now()
  await DB.prepare(`
    UPDATE subscriptions SET current_period_start=?, current_period_end=?, status='active', updated_at=? WHERE id=?
  `).bind(now, now + 30*24*60*60*1000, now, sub.id).run()

  await DB.prepare('UPDATE agents SET subscription_status=?, updated_at=? WHERE id=?').bind('active', now, sub.agent_id).run()
}

async function handleSubscriptionCancelled(c: any, payload: any, entity: any) {
  const { DB } = c.env
  const subId = entity.id

  const sub = await DB.prepare('SELECT * FROM subscriptions WHERE provider_subscription_id = ?').bind(subId).first()
  if (!sub) return

  await DB.prepare('UPDATE subscriptions SET status=?, cancelled_at=?, updated_at=? WHERE id=?').bind('cancelled', Date.now(), Date.now(), sub.id).run()
  await DB.prepare('UPDATE agents SET plan=?, subscription_status=?, updated_at=? WHERE id=?').bind('starter', 'cancelled', Date.now(), sub.agent_id).run()
}

async function handleRefundProcessed(c: any, payload: any, entity: any) {
  const { DB } = c.env
  const paymentId = entity.payment_id

  const order = await DB.prepare('SELECT * FROM payment_orders WHERE provider_order_id = (SELECT order_id FROM payments WHERE id = ?)').bind(paymentId).first()
  if (!order) return

  await DB.prepare('UPDATE payment_orders SET status=?, updated_at=? WHERE id=?').bind('refunded', Date.now(), order.id).run()
}

// ============================================
// PAYPAL WEBHOOK
// ============================================
paymentWebhooks.post('/paypal', async (c) => {
  const { DB, PAYPAL_WEBHOOK_ID, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE } = c.env
  const body = await c.req.text()

  // Verify webhook signature via PayPal's verify-webhook-signature API
  const headers: Record<string, string> = {
    'paypal-auth-algo': c.req.header('paypal-auth-algo') || '',
    'paypal-cert-url': c.req.header('paypal-cert-url') || '',
    'paypal-transmission-id': c.req.header('paypal-transmission-id') || '',
    'paypal-transmission-sig': c.req.header('paypal-transmission-sig') || '',
    'paypal-transmission-time': c.req.header('paypal-transmission-time') || '',
  }

  const isValid = await verifyPayPalSignature(c.env, headers, body)

  if (!isValid) {
    console.error('PayPal webhook: Invalid signature')
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const payload = JSON.parse(body)
  return await processPayPalWebhook(c, payload)
})

async function processPayPalWebhook(c: any, payload: any) {
  const { DB, APP_URL, APP_NAME } = c.env
  const eventType = payload.event_type
  const resource = payload.resource

  // Log webhook
  const webhookId = crypto.randomUUID()
  await DB.prepare(`
    INSERT INTO payment_webhooks (id, provider, event_type, payload, signature, processed, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).bind(webhookId, 'paypal', eventType, JSON.stringify(payload), '', Date.now()).run()

  // Check idempotency
  const existing = await DB.prepare(`
    SELECT 1 FROM payment_webhooks WHERE provider='paypal' AND event_type=? AND payload=? AND processed=1
  `).bind(eventType, JSON.stringify(payload)).first()
  if (existing) {
    return c.json({ received: true, duplicate: true })
  }

  let processed = false
  let error: string | null = null

  try {
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      await handlePayPalPaymentCompleted(c, resource)
      processed = true
    } else if (eventType === 'PAYMENT.CAPTURE.DENIED') {
      await handlePayPalPaymentDenied(c, resource)
      processed = true
    } else if (eventType === 'BILLING.SUBSCRIPTION.CHARGED') {
      await handlePayPalSubscriptionCharged(c, resource)
      processed = true
    } else if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
      await handlePayPalSubscriptionCancelled(c, resource)
      processed = true
    } else if (eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
      await handlePayPalSubscriptionExpired(c, resource)
      processed = true
    }
  } catch (err) {
    error = String(err)
    console.error('PayPal webhook processing error:', err)
  }

  await DB.prepare(`
    UPDATE payment_webhooks SET processed=?, processed_at=?, error=? WHERE id=?
  `).bind(processed ? 1 : 0, Date.now(), error, webhookId).run()

  return c.json({ received: true, processed })
}

async function handlePayPalPaymentCompleted(c: any, resource: any) {
  const { DB } = c.env
  const captureId = resource.id
  const orderId = resource.supplementary_data?.related_ids?.order_id
  const amount = Math.round(parseFloat(resource.amount.value) * 100)
  const currency = resource.amount.currency_code

  // Find order by PayPal order ID
  const order = await DB.prepare('SELECT * FROM payment_orders WHERE provider_order_id = ?').bind(orderId).first()
  if (!order) {
    console.warn('PayPal: Order not found for capture', captureId)
    return
  }

  await DB.prepare(`
    UPDATE payment_orders SET status='paid', paid_at=?, updated_at=? WHERE id=?
  `).bind(Date.now(), Date.now(), order.id).run()

  const subId = crypto.randomUUID()
  const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(order.agent_id).first()
  const now = Date.now()

  await DB.prepare(`
    INSERT INTO subscriptions (id, agent_id, provider, provider_subscription_id, provider_customer_id, plan, status, current_period_start, current_period_end, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `).bind(subId, order.agent_id, 'paypal', captureId, resource.payer?.email_address || '', order.plan, 'active', now, now + 30*24*60*60*1000, now, now).run()

  await DB.prepare(`
    UPDATE agents SET plan=?, subscription_status='active', payment_provider='paypal', payment_customer_id=?, updated_at=? WHERE id=?
  `).bind(order.plan, resource.payer?.email_address || '', Date.now(), order.agent_id).run()

  if (agent?.email) {
    const emailService = new EmailService(c.env.RESEND_API_KEY)
    await emailService.sendLeadNotification(agent.email, 'Subscription Activated', {
      Plan: order.plan,
      Amount: `${(amount / 100).toFixed(2)} ${currency}`,
      Status: 'Active',
    })
  }
}

async function handlePayPalPaymentDenied(c: any, resource: any) {
  const { DB } = c.env
  const orderId = resource.supplementary_data?.related_ids?.order_id

  const order = await DB.prepare('SELECT * FROM payment_orders WHERE provider_order_id = ?').bind(orderId).first()
  if (!order) return

  await DB.prepare('UPDATE payment_orders SET status=?, updated_at=? WHERE id=?').bind('failed', Date.now(), order.id).run()

  const agent = await DB.prepare('SELECT email FROM agents WHERE id = ?').bind(order.agent_id).first()
  if (agent?.email) {
    const emailService = new EmailService(c.env.RESEND_API_KEY)
    await emailService.sendLeadNotification(agent.email, 'Payment Failed', {
      Amount: `${(resource.amount.value)} ${resource.amount.currency_code}`,
      Reason: resource.status_details?.reason || 'Payment denied',
    })
  }
}

async function handlePayPalSubscriptionCharged(c: any, resource: any) {
  const { DB } = c.env
  const subId = resource.id

  const sub = await DB.prepare('SELECT * FROM subscriptions WHERE provider_subscription_id = ?').bind(subId).first()
  if (!sub) return

  const now = Date.now()
  await DB.prepare(`
    UPDATE subscriptions SET current_period_start=?, current_period_end=?, status='active', updated_at=? WHERE id=?
  `).bind(now, now + 30*24*60*60*1000, now, sub.id).run()

  await DB.prepare('UPDATE agents SET subscription_status=?, updated_at=? WHERE id=?').bind('active', now, sub.agent_id).run()
}

async function handlePayPalSubscriptionCancelled(c: any, resource: any) {
  const { DB } = c.env
  const subId = resource.id

  const sub = await DB.prepare('SELECT * FROM subscriptions WHERE provider_subscription_id = ?').bind(subId).first()
  if (!sub) return

  await DB.prepare('UPDATE subscriptions SET status=?, cancelled_at=?, updated_at=? WHERE id=?').bind('cancelled', Date.now(), Date.now(), sub.id).run()
  await DB.prepare('UPDATE agents SET plan=?, subscription_status=?, updated_at=? WHERE id=?').bind('starter', 'cancelled', Date.now(), sub.agent_id).run()
}

async function handlePayPalSubscriptionExpired(c: any, resource: any) {
  const { DB } = c.env
  const subId = resource.id

  const sub = await DB.prepare('SELECT * FROM subscriptions WHERE provider_subscription_id = ?').bind(subId).first()
  if (!sub) return

  await DB.prepare('UPDATE subscriptions SET status=?, updated_at=? WHERE id=?').bind('expired', Date.now(), sub.id).run()
  await DB.prepare('UPDATE agents SET plan=?, subscription_status=?, updated_at=? WHERE id=?').bind('starter', 'expired', Date.now(), sub.agent_id).run()
}

export default paymentWebhooks