import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { loginSchema, agentSchema } from '../BACKEND/validation'
import { sign, verify } from 'hono/jwt'
import type { Env } from '../types/env'

const authRoutes = new Hono<{ Bindings: Env }>()

authRoutes.get('/login', (c) => {
  const error = c.req.query('error')
  const redirect = c.req.query('redirect') || '/dashboard'
  return c.html(renderAuthPage('login', { error, redirect }))
})

authRoutes.get('/register', (c) => {
  const error = c.req.query('error')
  return c.html(renderAuthPage('register', { error }))
})

authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json')
  const { DB, JWT_SECRET } = c.env

  const agent = await DB.prepare('SELECT * FROM agents WHERE email = ?').bind(email).first()
  if (!agent) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyPassword(password, agent.password_hash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const now = Math.floor(Date.now() / 1000)
  const token = await sign({ agentId: agent.id, email, exp: now + 7 * 24 * 60 * 60 }, JWT_SECRET, 'HS256')

  c.header('Set-Cookie', `auth_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`)
  return c.json({ agent: { id: agent.id, email: agent.email, name: agent.name, plan: agent.plan }, redirect: '/dashboard' })
})

authRoutes.post('/register', zValidator('json', agentSchema), async (c) => {
  const { email, password, name } = c.req.valid('json')
  const { DB, JWT_SECRET } = c.env

  const existing = await DB.prepare('SELECT id FROM agents WHERE email = ?').bind(email).first()
  if (existing) return c.json({ error: 'Email already registered' }, 400)

  const passwordHash = await hashPassword(password)
  const agentId = crypto.randomUUID()
  const now = Date.now()
  const trialEnds = now + 14 * 24 * 60 * 60 * 1000

  await DB.prepare(`
    INSERT INTO agents (id, email, password_hash, name, trial_ends_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(agentId, email, passwordHash, name, trialEnds, now, now).run()

  const nowSec = Math.floor(Date.now() / 1000)
  const token = await sign({ agentId, email, exp: nowSec + 7 * 24 * 60 * 60 }, JWT_SECRET, 'HS256')
  c.header('Set-Cookie', `auth_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`)
  return c.json({ agent: { id: agentId, email, name, plan: 'starter', trial_ends_at: trialEnds }, redirect: '/dashboard' })
})

authRoutes.post('/logout', (c) => {
  c.header('Set-Cookie', 'auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0')
  return c.json({ success: true })
})

authRoutes.get('/me', async (c) => {
  const token = c.req.header('Cookie')?.split('auth_token=')[1]?.split(';')[0]
  if (!token) return c.json({ authenticated: false }, 401)

  try {
    const { JWT_SECRET } = c.env
    const payload = await verify(token, JWT_SECRET, 'HS256')
    const { DB } = c.env
    const agent = await DB.prepare('SELECT id, email, name, plan, payment_provider, payment_customer_id, subscription_status, trial_ends_at FROM agents WHERE id = ?').bind(payload.agentId).first()
    if (!agent) return c.json({ authenticated: false }, 401)
    return c.json({ authenticated: true, agent })
  } catch { return c.json({ authenticated: false }, 401) }
})

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password)
  return computed === hash
}

function renderAuthPage(type: 'login' | 'register', data: { error?: string; redirect?: string }) {
  const isLogin = type === 'login'
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${isLogin ? 'Sign in to Conduit' : 'Create your Conduit account'}">
  <title>${isLogin ? 'Sign In' : 'Create Account'} - Conduit</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>body { font-family: 'Inter', sans-serif; } @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }</style>
</head>
<body class="bg-neutral-25 min-h-screen flex items-center justify-center py-12 px-4">
  <div class="w-full max-w-md">
    <div class="text-center mb-8 animate-in">
      <a href="/" class="inline-flex items-center gap-2 mb-6" aria-label="Conduit home">
        <div class="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center">
          <svg class="h-7 w-7 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
        </div>
      </a>
      <h1 class="text-heading-lg text-neutral-900 mb-2">${isLogin ? 'Welcome back' : 'Create your account'}</h1>
      <p class="text-body-md text-neutral-500">${isLogin ? 'Sign in to access your dashboard' : 'Start your 14-day free trial. No credit card required.'}</p>
    </div>
    <div class="card-padded bg-gradient-card animate-in">
      ${data.error ? `<div class="toast toast-error mb-6" role="alert"><svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg><span>${data.error}</span></div>` : ''}
      <form id="auth-form" class="space-y-5" novalidate>
        ${!isLogin ? `<div class="form-group"><label for="name" class="label">Full Name</label><input type="text" id="name" name="name" class="input" required autocomplete="name" aria-describedby="name-error"><p id="name-error" class="input-error-text hidden"></p></div>` : ''}
        <div class="form-group"><label for="email" class="label">Email Address</label><input type="email" id="email" name="email" class="input" required autocomplete="email" aria-describedby="email-error"><p id="email-error" class="input-error-text hidden"></p></div>
        <div class="form-group"><label for="password" class="label">Password</label><div class="relative"><input type="password" id="password" name="password" class="input pr-12" required minlength="8" autocomplete="${isLogin ? 'current-password' : 'new-password'}" aria-describedby="password-error"><button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600" aria-label="Toggle password visibility" onclick="togglePassword('password', this)"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button></div><p id="password-error" class="input-error-text hidden"></p><p class="input-hint">At least 8 characters</p></div>
        ${!isLogin ? `<div class="form-group"><label for="confirmPassword" class="label">Confirm Password</label><input type="password" id="confirmPassword" name="confirmPassword" class="input" required autocomplete="new-password" aria-describedby="confirm-error"><p id="confirm-error" class="input-error-text hidden"></p></div>` : ''}
        <div class="form-group"><label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="terms" name="terms" class="checkbox" required aria-describedby="terms-error"><span class="text-body-sm text-neutral-700">I agree to the <a href="#" class="link">Terms of Service</a> and <a href="#" class="link">Privacy Policy</a></span></label><p id="terms-error" class="input-error-text hidden"></p></div>
        <button type="submit" class="btn-primary w-full mt-2" id="submit-btn"><span class="btn-text">${isLogin ? 'Sign In' : 'Create Account'}</span><span class="btn-loader hidden flex items-center gap-2"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>${isLogin ? 'Signing in...' : 'Creating account...'}</span></button>
      </form>
      <div class="mt-6 text-center"><p class="text-body-sm text-neutral-500">${isLogin ? "Don't have an account? " : 'Already have an account? '}<a href="/auth/${isLogin ? 'register' : 'login'}" class="link font-medium">${isLogin ? 'Create one' : 'Sign in'}</a></p></div>
      <div class="mt-6 pt-6 border-t border-neutral-200"><a href="/" class="btn-secondary w-full">← Back to Conduit</a></div>
    </div>
  </div>
  <script>
    (function() { const form = document.getElementById('auth-form'); const submitBtn = document.getElementById('submit-btn'); const btnText = submitBtn.querySelector('.btn-text'); const btnLoader = submitBtn.querySelector('.btn-loader'); window.togglePassword = function(fieldId, btn) { const field = document.getElementById(fieldId); const icon = btn.querySelector('svg'); if (field.type === 'password') { field.type = 'text'; icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 01.002-1.084M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18a6 6 0 006-6v-3m-6 3a6 6 0 01-6-6"/>'; } else { field.type = 'password'; icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0-8.268 2.943-9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>'; } }; function validateField(field) { const errorEl = document.getElementById(field.id + '-error'); if (!errorEl) return true; let isValid = true, message = ''; if (field.required && !field.value.trim()) { isValid = false; message = 'This field is required'; } else if (field.type === 'email' && field.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)) { isValid = false; message = 'Please enter a valid email address'; } else if (field.id === 'password' && field.value && field.value.length < 8) { isValid = false; message = 'Password must be at least 8 characters'; } else if (field.id === 'confirmPassword' && field.value !== document.getElementById('password').value) { isValid = false; message = 'Passwords do not match'; } else if (field.id === 'terms' && !field.checked) { isValid = false; message = 'You must agree to the terms'; } field.classList.toggle('input-error', !isValid); field.classList.toggle('input-success', isValid && field.value.trim()); errorEl.textContent = message; errorEl.classList.toggle('hidden', isValid); return isValid; } form.querySelectorAll('input, select, textarea').forEach(field => { field.addEventListener('blur', () => validateField(field)); field.addEventListener('input', () => { if (field.classList.contains('input-error')) validateField(field); }); }); form.addEventListener('submit', async (e) => { e.preventDefault(); let allValid = true; form.querySelectorAll('input[required], select[required], textarea[required]').forEach(field => { if (!validateField(field)) allValid = false; }); if (!allValid) { const firstError = form.querySelector('.input-error'); if (firstError) firstError.focus(); return; } submitBtn.disabled = true; btnText.classList.add('hidden'); btnLoader.classList.remove('hidden'); const formData = new FormData(form); const data = Object.fromEntries(formData.entries()); delete data.confirmPassword; delete data.terms; try { const response = await fetch('/auth/' + (isLogin ? 'login' : 'register'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), credentials: 'include' }); const result = await response.json(); if (response.ok) { const toast = document.createElement('div'); toast.className = 'toast toast-success'; toast.innerHTML = '<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg><span>' + (isLogin ? 'Welcome back!' : 'Account created! Redirecting...') + '</span>'; document.body.appendChild(toast); setTimeout(() => { window.location.href = result.redirect || '/dashboard' }, 1000); } else { throw new Error(result.error || 'Something went wrong'); } } catch (err) { submitBtn.disabled = false; btnText.classList.remove('hidden'); btnLoader.classList.add('hidden'); const toast = document.createElement('div'); toast.className = 'toast toast-error'; toast.innerHTML = '<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg><span>' + err.message + '</span>'; document.body.appendChild(toast); setTimeout(() => toast.remove(), 5000); } }); })(); </script></body></html>`
}

export default authRoutes