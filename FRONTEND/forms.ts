import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { submissionSchema } from '../BACKEND/validation'
import { CRMService } from '../BACKEND/crm'
import { TEMPLATES } from '../BACKEND/validation'
import type { Env } from '../types/env'

const forms = new Hono<{ Bindings: Env }>()

forms.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const { DB } = c.env

  const form = await DB.prepare(
    'SELECT * FROM forms WHERE slug = ? AND is_active = 1'
  ).bind(slug).first()

  if (!form) {
    return c.json({ error: 'Form not found' }, 404)
  }

  await DB.prepare('UPDATE forms SET views = views + 1 WHERE id = ?').bind(form.id).run()

  const settings = JSON.parse(form.settings || '{}')
  const template = form.template_id

  return c.html(generateFormHTML(form, settings, template))
})

forms.post('/:slug/submit', zValidator('json', submissionSchema), async (c) => {
  const slug = c.req.param('slug')
  const { data } = c.req.valid('json')
  const { DB, WEBHOOK_QUEUE, CRM_WEBHOOK_SECRET } = c.env

  const form = await DB.prepare(
    'SELECT * FROM forms WHERE slug = ? AND is_active = 1'
  ).bind(slug).first()

  if (!form) {
    return c.json({ error: 'Form not found' }, 404)
  }

  const submissionId = crypto.randomUUID()
  const now = Date.now()

  const crmConfig = JSON.parse(form.crm_config)
  const crmService = new CRMService(c.env)
  const leadData = mapToCRM(data, crmConfig.field_mapping)

  await DB.prepare(`
    INSERT INTO submissions (id, form_id, agent_id, data, lead_data, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).bind(submissionId, form.id, form.agent_id, JSON.stringify(data), JSON.stringify(leadData), now).run()

  await DB.prepare('UPDATE forms SET submissions = submissions + 1 WHERE id = ?').bind(form.id).run()

  await WEBHOOK_QUEUE.send({
    submissionId,
    formId: form.id,
    agentId: form.agent_id,
    crmType: form.crm_type,
    webhookUrl: crmConfig.webhook_url,
    payload: leadData,
    authToken: crmConfig.auth_token,
    secret: CRM_WEBHOOK_SECRET,
  })

  const settings = JSON.parse(form.settings || '{}')
  if (settings.redirect_url) {
    return c.redirect(settings.redirect_url)
  }

  return c.json({ success: true, message: 'Lead captured successfully!' })
})

function mapToCRM(data: Record<string, unknown>, mapping: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [formKey, crmKey] of Object.entries(mapping)) {
    if (data[formKey] !== undefined) {
      result[crmKey] = data[formKey]
    }
  }
  return result
}

function generateFormHTML(form: any, settings: any, templateId: string): string {
  const template = TEMPLATES.find(t => t.id === templateId)
  const fields = template?.fields || []

  const fieldHTML = fields.map(field => {
    const required = field.required ? 'required' : ''
    const placeholder = field.placeholder ? `placeholder="${field.placeholder}"` : ''
    const errorId = `${field.key}-error`

    switch (field.type) {
      case 'select':
        return `
          <div class="form-group">
            <label for="${field.key}" class="label">${field.label}${field.required ? ' <span class="text-error-500" aria-hidden="true">*</span>' : ''}</label>
            <select id="${field.key}" name="${field.key}" class="input" ${required} ${placeholder} aria-describedby="${errorId}">
              <option value="">Select...</option>
              ${field.options?.map(opt => `<option value="${opt}">${opt}</option>`).join('') || ''}
            </select>
            <p id="${errorId}" class="input-error-text hidden" aria-live="polite"></p>
          </div>
        `
      case 'textarea':
        return `
          <div class="form-group">
            <label for="${field.key}" class="label">${field.label}${field.required ? ' <span class="text-error-500" aria-hidden="true">*</span>' : ''}</label>
            <textarea id="${field.key}" name="${field.key}" class="textarea" ${required} ${placeholder} rows="4" aria-describedby="${errorId}"></textarea>
            <p id="${errorId}" class="input-error-text hidden" aria-live="polite"></p>
          </div>
        `
      case 'checkbox':
        return `
          <div class="form-group">
            <label class="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" id="${field.key}" name="${field.key}" class="checkbox" ${required} aria-describedby="${errorId}">
              <span class="text-body-md text-neutral-700">${field.label}</span>
            </label>
            <p id="${errorId}" class="input-error-text hidden" aria-live="polite"></p>
          </div>
        `
      case 'hidden':
        return `<input type="hidden" name="${field.key}" value="${field.placeholder || ''}">`
      default:
        return `
          <div class="form-group">
            <label for="${field.key}" class="label">${field.label}${field.required ? ' <span class="text-error-500" aria-hidden="true">*</span>' : ''}</label>
            <input type="${field.type === 'phone' ? 'tel' : field.type}" id="${field.key}" name="${field.key}" class="input" ${required} ${placeholder} aria-describedby="${errorId}" autocomplete="${field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'date' ? 'bday' : 'off'}">
            <p id="${errorId}" class="input-error-text hidden" aria-live="polite"></p>
          </div>
        `
    }
  }).join('')

  const mlsDisclaimer = settings.mls_disclaimer ? `
    <div class="mb-6 p-4 bg-warning-50 border border-warning-200 rounded-xl flex items-start gap-3" role="alert">
      <svg class="h-5 w-5 text-warning-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      <div>
        <p class="font-medium text-warning-800">MLS Compliance Disclaimer</p>
        <p class="text-body-sm text-warning-700 mt-1">This information is provided for marketing purposes only. All data is deemed reliable but not guaranteed. Please verify with your local MLS.</p>
      </div>
    </div>
  ` : ''

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${form.name} - Lead capture form powered by Conduit">
  <meta name="theme-color" content="#2563eb">
  <title>${form.name} - Conduit</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }
  </style>
</head>
<body class="bg-neutral-25 min-h-screen flex items-center justify-center py-12 px-4">
  <div class="w-full max-w-md">
    <!-- Header -->
    <div class="text-center mb-8 animate-in">
      <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 mx-auto mb-4">
        <svg class="h-8 w-8 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
        </svg>
      </div>
      <h1 class="text-heading-lg text-neutral-900 mb-2">${form.name}</h1>
      <p class="text-body-md text-neutral-500">Powered by Conduit</p>
    </div>

    <!-- Form Card -->
    <div class="card-padded bg-gradient-card animate-in">
      <form id="conduit-form" class="space-y-5" novalidate>
        ${fieldHTML}
        ${mlsDisclaimer}
        <button type="submit" class="btn-primary w-full mt-2" aria-label="Submit form">
          <span class="btn-text">Submit</span>
          <span class="btn-loader hidden flex items-center gap-2">
            <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Submitting...
          </span>
        </button>
      </form>

      <!-- Success State (hidden by default) -->
      <div id="success-state" class="hidden animate-in text-center py-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-50 mb-4">
          <svg class="h-8 w-8 text-success-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
        </div>
        <h2 class="text-heading-md text-neutral-900 mb-2">Lead Captured!</h2>
        <p class="text-body-md text-neutral-600 mb-6">Thanks for your interest. We'll be in touch soon.</p>
        <a href="/" class="link">Back to Conduit</a>
      </div>

      <p class="mt-6 text-center text-caption text-neutral-500">
        Powered by <a href="https://conduithq.io" class="link">Conduit</a>
      </p>
    </div>
  </div>

  <script>
    (function() {
      const form = document.getElementById('conduit-form')
      const successState = document.getElementById('success-state')
      const submitBtn = form.querySelector('button[type="submit"]')
      const btnText = submitBtn.querySelector('.btn-text')
      const btnLoader = submitBtn.querySelector('.btn-loader')

      // Client-side validation
      function validateField(field) {
        const errorEl = document.getElementById(field.id + '-error')
        if (!errorEl) return true

        let isValid = true
        let message = ''

        if (field.required && !field.value.trim()) {
          isValid = false
          message = 'This field is required'
        } else if (field.type === 'email' && field.value && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(field.value)) {
          isValid = false
          message = 'Please enter a valid email address'
        } else if (field.type === 'tel' && field.value && !/^[\\d\\s\\-\\+()]{10,}$/.test(field.value)) {
          isValid = false
          message = 'Please enter a valid phone number'
        }

        field.classList.toggle('input-error', !isValid)
        field.classList.toggle('input-success', isValid && field.value.trim())
        errorEl.textContent = message
        errorEl.classList.toggle('hidden', isValid)

        return isValid
      }

      // Validate on blur
      form.querySelectorAll('input, select, textarea').forEach(field => {
        field.addEventListener('blur', () => validateField(field))
        field.addEventListener('input', () => {
          if (field.classList.contains('input-error')) {
            validateField(field)
          }
        })
      })

      // Form submit
      form.addEventListener('submit', async (e) => {
        e.preventDefault()

        // Validate all fields
        let allValid = true
        form.querySelectorAll('input[required], select[required], textarea[required]').forEach(field => {
          if (!validateField(field)) allValid = false
        })

        if (!allValid) {
          const firstError = form.querySelector('.input-error')
          if (firstError) firstError.focus()
          return
        }

        // Show loading state
        submitBtn.disabled = true
        btnText.classList.add('hidden')
        btnLoader.classList.remove('hidden')

        const formData = new FormData(form)
        const data = Object.fromEntries(formData.entries())

        try {
          const response = await fetch('/forms/${form.slug}/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data })
          })

          if (response.ok) {
            form.classList.add('hidden')
            successState.classList.remove('hidden')
            
            ${settings.redirect_url ? `
            setTimeout(() => {
              window.location.href = '${settings.redirect_url}'
            }, 2000)
            ` : ''}
          } else {
            throw new Error('Submission failed')
          }
        } catch (err) {
          submitBtn.disabled = false
          btnText.classList.remove('hidden')
          btnLoader.classList.add('hidden')
          
          // Show error toast
          const toast = document.createElement('div')
          toast.className = 'toast toast-error'
          toast.innerHTML = \`
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <span>Error submitting form. Please try again.</span>
          \`
          document.body.appendChild(toast)
          setTimeout(() => toast.remove(), 5000)
        }
      })
    })()
  </script>
</body>
</html>
  `
}

export default forms