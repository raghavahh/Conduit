import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { Env } from '../types/env'

const webhooks = new Hono<{ Bindings: Env }>()

webhooks.post('/:crm', async (c) => {
  const crm = c.req.param('crm')
  const { DB, CRM_WEBHOOK_SECRET } = c.env

  const signature = c.req.header('x-conduit-signature')
  const body = await c.req.text()

  const expectedSig = await generateSignature(body, CRM_WEBHOOK_SECRET)
  if (signature !== expectedSig) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const payload = JSON.parse(body)
  const logId = crypto.randomUUID()
  const now = Date.now()

  await DB.prepare(`
    INSERT INTO webhook_logs (id, form_id, submission_id, crm_type, payload, response, status_code, success, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    logId,
    payload.formId || '',
    payload.submissionId || '',
    crm,
    body,
    'received',
    200,
    1,
    now
  ).run()

  return c.json({ received: true })
})

async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export default webhooks