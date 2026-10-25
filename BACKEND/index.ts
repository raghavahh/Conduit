import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'

import forms from '../FRONTEND/forms'
import webhooks from './webhooks'
import auth from '../FRONTEND/auth'
import admin from '../FRONTEND/admin'
import publicRoutes from '../FRONTEND/public'
import paymentRoutes from './payment-api'
import paymentWebhooks from './payment-webhooks'
import type { Env } from '../types/env'

const app = new Hono<{ Bindings: Env }>()

app.use('*', logger())
app.use('*', secureHeaders())
app.use('*', cors({
  origin: (origin, c) => c.env.APP_URL,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.get('/health', (c) => c.json({ ok: true, ts: Date.now(), app: c.env.APP_NAME }))

// Public pages
app.route('/', publicRoutes)
app.route('/forms', forms)
app.route('/auth', auth)

// CRM webhook receiver + payment webhooks (no auth — signature-verified)
app.route('/webhooks', webhooks)
app.route('/webhooks', paymentWebhooks)

// Dashboard pages + admin API (cookie auth via requireAuth in each router)
app.route('/', admin)

// Payment API (cookie auth via requireAuth)
app.route('/api/payments', paymentRoutes)

app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error(`${c.req.method} ${c.req.url}`, err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
