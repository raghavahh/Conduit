import Razorpay from 'razorpay'
import paypal from '@paypal/checkout-server-sdk'

// Shared HMAC-SHA256 helper (Web Crypto — works in Cloudflare Workers)
async function hmacSha256(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ============================================
// TYPES & INTERFACES
// ============================================

export interface OrderParams {
  amount: number; // smallest currency unit (paise/cents)
  currency: 'INR' | 'USD';
  plan: 'starter' | 'pro' | 'team';
  billingCycle: 'monthly' | 'yearly';
  agentId: string;
  metadata?: Record<string, any>;
  idempotencyKey: string;
}

export interface OrderResult {
  orderId: string;
  amount: number;
  currency: string;
  checkoutUrl?: string; // for PayPal redirect
  razorpayKeyId?: string; // for Razorpay frontend
}

export interface VerifyParams {
  provider: 'razorpay' | 'paypal';
  orderId: string;
  paymentId: string;
  signature?: string; // Razorpay
  payerId?: string; // PayPal
}

export interface VerificationResult {
  success: boolean;
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: 'captured' | 'failed' | 'pending';
  error?: string;
}

export interface SubParams {
  amount: number;
  currency: 'INR' | 'USD';
  plan: 'starter' | 'pro' | 'team';
  billingCycle: 'monthly' | 'yearly';
  agentId: string;
  customerId: string;
  metadata?: Record<string, any>;
}

export interface SubResult {
  subscriptionId: string;
  customerId: string;
  status: 'active' | 'created' | 'failed';
}

export interface WebhookEvent {
  type: string;
  provider: 'razorpay' | 'paypal';
  orderId?: string;
  paymentId?: string;
  subscriptionId?: string;
  amount?: number;
  currency?: string;
  status: string;
  raw: any;
}

export interface PaymentProvider {
  name: 'razorpay' | 'paypal';
  createOrder(params: OrderParams): Promise<OrderResult>;
  verifyPayment(params: VerifyParams): Promise<VerificationResult>;
  createSubscription(params: SubParams): Promise<SubResult>;
  cancelSubscription(subId: string): Promise<void>;
  verifyWebhook(payload: string, signature: string): Promise<boolean>;
  parseWebhook(payload: any): WebhookEvent;
}

// ============================================
// RAZORPAY PROVIDER
// ============================================

export class RazorpayProvider implements PaymentProvider {
  name = 'razorpay' as const;
  private client: Razorpay;
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor(keyId: string, keySecret: string, webhookSecret: string) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret;
  }

  async createOrder(params: OrderParams): Promise<OrderResult> {
    const order = await this.client.orders.create({
      amount: params.amount,
      currency: params.currency,
      receipt: params.idempotencyKey,
      notes: {
        plan: params.plan,
        billing_cycle: params.billingCycle,
        agent_id: params.agentId,
        ...params.metadata,
      },
    });

    return {
      orderId: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      razorpayKeyId: this.keyId,
    };
  }

  async verifyPayment(params: VerifyParams): Promise<VerificationResult> {
    try {
      // Verify HMAC signature if provided (checkout handler flow)
      if (params.signature && params.orderId) {
        const expectedSig = await hmacSha256(this.keySecret, `${params.orderId}|${params.paymentId}`);
        if (params.signature !== expectedSig) {
          return { success: false, orderId: params.orderId, paymentId: params.paymentId, amount: 0, currency: '', status: 'failed', error: 'Invalid signature' };
        }
      }

      const payment = await this.client.payments.fetch(params.paymentId);

      return {
        success: payment.status === 'captured',
        orderId: payment.order_id,
        paymentId: payment.id,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status as any,
      };
    } catch (error) {
      return { success: false, orderId: params.orderId, paymentId: params.paymentId, amount: 0, currency: '', status: 'failed', error: String(error) };
    }
  }

  async createSubscription(params: SubParams): Promise<SubResult> {
    // Create customer if needed
    let customerId = params.customerId;
    if (!customerId) {
      const customer = await this.client.customers.create({
        email: params.metadata?.email,
        name: params.metadata?.name,
      });
      customerId = customer.id;
    }

    const subscription: any = await this.client.subscriptions.create({
      plan_id: this.getPlanId(params.plan, params.billingCycle),
      customer_id: customerId,
      total_count: 12, // Razorpay requires 1-100; 12 renewals of the plan interval
    } as any);

    return {
      subscriptionId: subscription.id,
      customerId,
      status: subscription.status as any,
    };
  }

  async cancelSubscription(subId: string): Promise<void> {
    await this.client.subscriptions.cancel(subId);
  }

  async verifyWebhook(payload: string, signature: string): Promise<boolean> {
    const expectedSig = await hmacSha256(this.webhookSecret, payload);
    return signature === expectedSig;
  }

  parseWebhook(payload: any): WebhookEvent {
    const event = payload.event;
    const payment = payload.payload?.payment?.entity;
    const subscription = payload.payload?.subscription?.entity;

    return {
      type: event,
      provider: 'razorpay',
      orderId: payment?.order_id || subscription?.plan_id,
      paymentId: payment?.id,
      subscriptionId: subscription?.id,
      amount: payment?.amount || subscription?.plan_id ? undefined : undefined,
      currency: payment?.currency || 'INR',
      status: payment?.status || subscription?.status,
      raw: payload,
    };
  }

  private getPlanId(plan: string, cycle: string): string {
    const plans: Record<string, Record<string, string>> = {
      starter: { monthly: 'plan_starter_monthly', yearly: 'plan_starter_yearly' },
      pro: { monthly: 'plan_pro_monthly', yearly: 'plan_pro_yearly' },
      team: { monthly: 'plan_team_monthly', yearly: 'plan_team_yearly' },
    };
    return plans[plan]?.[cycle] || 'plan_starter_monthly';
  }
}

// ============================================
// PAYPAL PROVIDER
// ============================================

export class PayPalProvider implements PaymentProvider {
  name = 'paypal' as const;
  private client: paypal.core.PayPalHttpClient;
  private environment: paypal.core.PayPalEnvironment;
  private clientId: string;
  private clientSecret: string;
  private base: string;

  constructor(clientId: string, clientSecret: string, mode: 'sandbox' | 'live') {
    this.environment = mode === 'live'
      ? new paypal.core.LiveEnvironment(clientId, clientSecret)
      : new paypal.core.SandboxEnvironment(clientId, clientSecret);
    this.client = new paypal.core.PayPalHttpClient(this.environment);
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.base = mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  // REST access token for subscription endpoints (not covered by checkout-server-sdk)
  private async getAccessToken(): Promise<string> {
    const res = await fetch(`${this.base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${this.clientId}:${this.clientSecret}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`)
    const { access_token } = await res.json() as { access_token: string }
    return access_token
  }

  async createOrder(params: OrderParams): Promise<OrderResult> {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: params.currency,
          value: (params.amount / 100).toFixed(2), // PayPal expects dollars/rupees
        },
        description: `${params.plan} plan - ${params.billingCycle}`,
        custom_id: params.idempotencyKey,
      }],
      application_context: {
        brand_name: 'Conduit',
        landing_page: 'BILLING',
        user_action: 'PAY_NOW',
        return_url: `${params.metadata?.appUrl}/dashboard/billing?success=1`,
        cancel_url: `${params.metadata?.appUrl}/dashboard/billing?cancelled=1`,
      },
    });

    const response = await this.client.execute(request);
    const order = response.result;

    return {
      orderId: order.id,
      amount: params.amount,
      currency: params.currency,
      checkoutUrl: order.links?.find((l: any) => l.rel === 'approve')?.href,
    };
  }

  async verifyPayment(params: VerifyParams): Promise<VerificationResult> {
    try {
      // Capture the order
      const captureRequest = new paypal.orders.OrdersCaptureRequest(params.orderId);
      captureRequest.requestBody({} as any);
      const captureResponse = await this.client.execute(captureRequest);
      const capture = captureResponse.result;

      const captureStatus = capture.purchase_units[0]?.payments?.captures[0]?.status;
      const capturedAmount = capture.purchase_units[0]?.payments?.captures[0]?.amount;

      return {
        success: captureStatus === 'COMPLETED',
        orderId: params.orderId,
        paymentId: capture.id,
        amount: Math.round(parseFloat(capturedAmount?.value || '0') * 100),
        currency: capturedAmount?.currency_code || 'USD',
        status: captureStatus === 'COMPLETED' ? 'captured' : 'failed',
      };
    } catch (error) {
      return { success: false, orderId: params.orderId, paymentId: '', amount: 0, currency: '', status: 'failed', error: String(error) };
    }
  }

  async createSubscription(params: SubParams): Promise<SubResult> {
    // PayPal Subscriptions API via REST (checkout-server-sdk has no subscriptions module)
    const planId = this.getPlanId(params.plan, params.currency, params.billingCycle);
    const token = await this.getAccessToken();

    const res = await fetch(`${this.base}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id: planId,
        subscriber: {
          email_address: params.metadata?.email,
        },
        application_context: {
          brand_name: 'Conduit',
          return_url: `${params.metadata?.appUrl}/dashboard/billing?success=1`,
          cancel_url: `${params.metadata?.appUrl}/dashboard/billing?cancelled=1`,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`PayPal subscription creation failed: ${res.status}`);
    }

    const subscription: any = await res.json();

    return {
      subscriptionId: subscription.id,
      customerId: subscription.subscriber?.email_address || '',
      status: subscription.status as any,
    };
  }

  async cancelSubscription(subId: string): Promise<void> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.base}/v1/billing/subscriptions/${subId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'User cancelled' }),
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`PayPal subscription cancel failed: ${res.status}`);
    }
  }

  async verifyWebhook(payload: string, signature: string): Promise<boolean> {
    // PayPal webhook verification is performed in payment-webhooks.ts
    // via the PayPal verify-webhook-signature API (transmission + cert chain).
    // Returning false here forces callers to use that path.
    return false;
  }

  parseWebhook(payload: any): WebhookEvent {
    const eventType = payload.event_type;
    const resource = payload.resource;

    return {
      type: eventType,
      provider: 'paypal',
      orderId: resource.supplementary_data?.related_ids?.order_id || resource.id,
      paymentId: resource.id,
      subscriptionId: resource.id,
      amount: resource.amount ? Math.round(parseFloat(resource.amount.value) * 100) : undefined,
      currency: resource.amount?.currency_code || 'USD',
      status: resource.status,
      raw: payload,
    };
  }

  private getPlanId(plan: string, currency: string, cycle: string): string {
    // These would be created in PayPal Dashboard
    const plans: Record<string, Record<string, Record<string, string>>> = {
      INR: {
        starter: { monthly: 'P-PLAN_STARTER_INR_MONTHLY', yearly: 'P-PLAN_STARTER_INR_YEARLY' },
        pro: { monthly: 'P-PLAN_PRO_INR_MONTHLY', yearly: 'P-PLAN_PRO_INR_YEARLY' },
        team: { monthly: 'P-PLAN_TEAM_INR_MONTHLY', yearly: 'P-PLAN_TEAM_INR_YEARLY' },
      },
      USD: {
        starter: { monthly: 'P-PLAN_STARTER_USD_MONTHLY', yearly: 'P-PLAN_STARTER_USD_YEARLY' },
        pro: { monthly: 'P-PLAN_PRO_USD_MONTHLY', yearly: 'P-PLAN_PRO_USD_YEARLY' },
        team: { monthly: 'P-PLAN_TEAM_USD_MONTHLY', yearly: 'P-PLAN_TEAM_USD_YEARLY' },
      },
    };
    return plans[currency || 'USD']?.[plan]?.[cycle] || 'P-PLAN_STARTER_USD_MONTHLY';
  }
}

// ============================================
// PROVIDER FACTORY
// ============================================

export function getProvider(env: any, name: 'razorpay' | 'paypal'): PaymentProvider {
  if (name === 'razorpay') {
    return new RazorpayProvider(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET);
  }
  return new PayPalProvider(env.PAYPAL_CLIENT_ID, env.PAYPAL_CLIENT_SECRET, env.PAYPAL_MODE);
}

// ============================================
// HELPER: Get available providers for customer
// ============================================

export interface AvailableProvider {
  id: 'razorpay' | 'paypal';
  name: string;
  currency: 'INR' | 'USD';
  supported: boolean;
}

export function getAvailableProviders(country: string, currency: string): AvailableProvider[] {
  const providers: AvailableProvider[] = [];

  // Razorpay: Primary for INR/India, USD if approved
  if (currency === 'INR' || country === 'IN') {
    providers.push({ id: 'razorpay', name: 'Razorpay', currency: 'INR', supported: true });
  }

  // PayPal: For international (non-INR primary)
  if (currency !== 'INR') {
    providers.push({ id: 'paypal', name: 'PayPal', currency: 'USD', supported: true });
  }

  // If INR customer but wants USD, check if Razorpay USD is available
  // (Only if merchant account approved for international)
  // For now, default to PayPal for USD

  return providers;
}