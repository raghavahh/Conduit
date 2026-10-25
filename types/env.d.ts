// Hono context augmentation + shared env type
import { D1Database, KVNamespace, R2Bucket, Queue } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  KV: KVNamespace
  R2: R2Bucket
  WEBHOOK_QUEUE: Queue
  EMAIL_QUEUE: Queue
  RESEND_API_KEY: string
  RAZORPAY_KEY_ID: string
  RAZORPAY_KEY_SECRET: string
  RAZORPAY_WEBHOOK_SECRET: string
  PAYPAL_CLIENT_ID: string
  PAYPAL_CLIENT_SECRET: string
  PAYPAL_WEBHOOK_ID: string
  PAYPAL_MODE: string
  JWT_SECRET: string
  CRM_WEBHOOK_SECRET: string
  APP_URL: string
  APP_NAME: string
}

declare module 'hono' {
  interface ContextVariableMap {
    agentId: string
    agentEmail: string
  }
}
