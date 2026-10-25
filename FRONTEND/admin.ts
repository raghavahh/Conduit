import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { formSchema, apiKeySchema, teamMemberSchema, TEMPLATES } from '../BACKEND/validation'
import { verify } from 'hono/jwt'
import type { Env } from '../types/env'

const adminRoutes = new Hono<{ Bindings: Env }>()

// Auth middleware for admin routes
async function requireAuth(c: any, next: any) {
  const token = c.req.header('Cookie')?.split('auth_token=')[1]?.split(';')[0]
  if (!token) {
    return c.redirect('/auth/login?redirect=' + encodeURIComponent(c.req.path))
  }
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    c.set('agentId', payload.agentId)
    c.set('agentEmail', payload.email)
    await next()
  } catch {
    return c.redirect('/auth/login?redirect=' + encodeURIComponent(c.req.path))
  }
}

// Dashboard home
adminRoutes.get('/dashboard', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const { DB } = c.env

  const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first() as any
  const forms = await DB.prepare('SELECT * FROM forms WHERE agent_id = ? ORDER BY created_at DESC').bind(agentId).all() as any
  const submissions = await DB.prepare(`
    SELECT s.*, f.name as form_name, f.slug 
    FROM submissions s 
    JOIN forms f ON s.form_id = f.id 
    WHERE s.agent_id = ? 
    ORDER BY s.created_at DESC 
    LIMIT 50
  `).bind(agentId).all() as any

  const totalSubmissions = await DB.prepare('SELECT COUNT(*) as count FROM submissions WHERE agent_id = ?').bind(agentId).first() as any
  const thisMonth = await DB.prepare(`
    SELECT COUNT(*) as count FROM submissions 
    WHERE agent_id = ? AND created_at > ?
  `).bind(agentId, Date.now() - 30 * 24 * 60 * 60 * 1000).first() as any
  const lastWeek = await DB.prepare(`
    SELECT COUNT(*) as count FROM submissions 
    WHERE agent_id = ? AND created_at > ?
  `).bind(agentId, Date.now() - 7 * 24 * 60 * 60 * 1000).first() as any
  const conversionRate = totalSubmissions.count && forms.results?.length ? 
    ((totalSubmissions.count / (forms.results.length * 100)) * 100).toFixed(1) : '0.0'

  return c.html(renderDashboard({
    agent,
    stats: {
      totalForms: forms.results?.length || 0,
      totalSubmissions: totalSubmissions?.count || 0,
      thisMonth: thisMonth?.count || 0,
      lastWeek: lastWeek?.count || 0,
      conversionRate,
    },
    forms: forms.results || [],
    recentSubmissions: submissions.results || [],
  }))
})

// Forms list page
adminRoutes.get('/dashboard/forms', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const { DB } = c.env

  const forms = await DB.prepare('SELECT * FROM forms WHERE agent_id = ? ORDER BY created_at DESC').bind(agentId).all() as any
  const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first() as any

  return c.html(renderFormsList({ agent, forms: forms.results || [] }))
})

// Create form page
adminRoutes.get('/dashboard/forms/new', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const { DB } = c.env
  const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first() as any

  return c.html(renderFormBuilder({ agent, form: null, templates: TEMPLATES }))
})

// Edit form page
adminRoutes.get('/dashboard/forms/:id/edit', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const formId = c.req.param('id')
  const { DB } = c.env

  const form = await DB.prepare('SELECT * FROM forms WHERE id = ? AND agent_id = ?').bind(formId, agentId).first() as any
  if (!form) return c.redirect('/dashboard/forms')

  const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first() as any

  return c.html(renderFormBuilder({ agent, form, templates: TEMPLATES }))
})

// Form detail page
adminRoutes.get('/dashboard/forms/:id', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const formId = c.req.param('id')
  const { DB } = c.env

  const form = await DB.prepare('SELECT * FROM forms WHERE id = ? AND agent_id = ?').bind(formId, agentId).first() as any
  if (!form) return c.redirect('/dashboard/forms')

  const submissions = await DB.prepare(`
    SELECT * FROM submissions WHERE form_id = ? ORDER BY created_at DESC LIMIT 100
  `).bind(formId).all() as any

  const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first() as any

  return c.html(renderFormDetail({ agent, form, submissions: submissions.results || [] }))
})

// API: Create form
adminRoutes.post('/api/forms', requireAuth, zValidator('json', formSchema), async (c) => {
  const data = c.req.valid('json')
  const agentId = c.get('agentId')
  const { DB, APP_URL } = c.env

  const slug = generateSlug(data.name)
  const formId = crypto.randomUUID()
  const now = Date.now()

  // Check slug uniqueness
  const existing = await DB.prepare('SELECT id FROM forms WHERE slug = ? AND agent_id = ?').bind(slug, agentId).first() as any
  const finalSlug = existing ? `${slug}-${Date.now().toString(36)}` : slug

  await DB.prepare(`
    INSERT INTO forms (id, agent_id, slug, name, template_id, crm_type, crm_config, settings, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(formId, agentId, finalSlug, data.name, data.template_id || null, data.crm_type, JSON.stringify(data.crm_config), JSON.stringify(data.settings || {}), now, now).run()

  return c.json({ form: { id: formId, slug: finalSlug, name: data.name } })
})

// API: Update form
adminRoutes.put('/api/forms/:id', requireAuth, zValidator('json', formSchema), async (c) => {
  const formId = c.req.param('id')
  const data = c.req.valid('json')
  const agentId = c.get('agentId')
  const { DB } = c.env

  const now = Date.now()
  await DB.prepare(`
    UPDATE forms SET name = ?, template_id = ?, crm_type = ?, crm_config = ?, settings = ?, updated_at = ?
    WHERE id = ? AND agent_id = ?
  `).bind(data.name, data.template_id || null, data.crm_type, JSON.stringify(data.crm_config), JSON.stringify(data.settings || {}), now, formId, agentId).run()

  return c.json({ success: true })
})

// API: Delete form
adminRoutes.delete('/api/forms/:id', requireAuth, async (c) => {
  const formId = c.req.param('id')
  const agentId = c.get('agentId')
  const { DB } = c.env

  await DB.prepare('DELETE FROM forms WHERE id = ? AND agent_id = ?').bind(formId, agentId).run()
  return c.json({ success: true })
})

// API: Duplicate form
adminRoutes.post('/api/forms/:id/duplicate', requireAuth, async (c) => {
  const formId = c.req.param('id')
  const agentId = c.get('agentId')
  const { DB, APP_URL } = c.env

  const original = await DB.prepare('SELECT * FROM forms WHERE id = ? AND agent_id = ?').bind(formId, agentId).first() as any
  if (!original) return c.json({ error: 'Form not found' }, 404)

  const newId = crypto.randomUUID()
  const slug = generateSlug(`${original.name} Copy`)
  const now = Date.now()

  await DB.prepare(`
    INSERT INTO forms (id, agent_id, slug, name, template_id, crm_type, crm_config, settings, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(newId, agentId, slug, `${original.name} Copy`, original.template_id, original.crm_type, original.crm_config, original.settings, now, now).run()

  return c.json({ form: { id: newId, slug } })
})

// Submissions export
adminRoutes.get('/dashboard/forms/:id/export', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const formId = c.req.param('id')
  const { DB } = c.env

  const form = await DB.prepare('SELECT * FROM forms WHERE id = ? AND agent_id = ?').bind(formId, agentId).first() as any
  if (!form) return c.redirect('/dashboard/forms')

  const submissions = await DB.prepare(`
    SELECT * FROM submissions WHERE form_id = ? ORDER BY created_at DESC
  `).bind(formId).all() as any

  const csv = generateCSV(submissions.results || [])
  
  c.header('Content-Type', 'text/csv')
  c.header('Content-Disposition', `attachment; filename="${form.name.replace(/[^a-z0-9]/gi, '_')}_submissions_${Date.now()}.csv"`)
  return c.body(csv)
})

// Team management
adminRoutes.get('/dashboard/team', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const { DB } = c.env

  const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first() as any
  if (!agent || (agent.plan !== 'pro' && agent.plan !== 'team')) {
    return c.redirect('/dashboard?error=Team features require Pro or Team plan')
  }

  const members = await DB.prepare('SELECT * FROM team_members WHERE agent_id = ?').bind(agentId).all() as any

  return c.html(renderTeamPage({ agent, members: members.results || [] }))
})

// API Keys
adminRoutes.get('/dashboard/api-keys', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const { DB } = c.env

  const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first() as any
  const keys = await DB.prepare('SELECT id, name, last_used_at, created_at FROM api_keys WHERE agent_id = ?').bind(agentId).all() as any

  return c.html(renderApiKeysPage({ agent, keys: keys.results || [] }))
})

// Billing page
adminRoutes.get('/dashboard/billing', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const { DB } = c.env

  const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first() as any

  return c.html(renderBillingPage({ agent }))
})

// Settings page
adminRoutes.get('/dashboard/settings', requireAuth, async (c) => {
  const agentId = c.get('agentId')
  const { DB } = c.env

  const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first() as any

  return c.html(renderSettingsPage({ agent }))
})

// Helper functions
function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').substring(0, 50)
}

function generateCSV(rows: any[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const headerRow = headers.join(',')
  const dataRows = rows.map(row => headers.map(h => {
    const val = row[h]
    if (val === null || val === undefined) return ''
    const str = String(val)
    return str.includes(',') || str.includes('"') || str.includes('\n') ? '"' + str.replace(/"/g, '""') + '"' : str
  }).join(','))
  return [headerRow, ...dataRows].join('\n')
}

import { sign } from 'hono/jwt'

// ===== RENDER FUNCTIONS =====

function renderDashboard(data: any) {
  const { agent, stats, forms, recentSubmissions } = data
  const trialDaysLeft = agent.trial_ends_at ? Math.max(0, Math.ceil((agent.trial_ends_at - Date.now()) / (24 * 60 * 60 * 1000))) : 0
  const isTrial = trialDaysLeft > 0 && agent.subscription_status === 'trialing'

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - Conduit</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>body { font-family: 'Inter', sans-serif; }</style>
</head>
<body class="bg-neutral-25">
  ${renderSidebar(agent, 'dashboard')}
  <div class="lg:pl-64 min-h-screen">
    ${renderTopBar(agent)}
    <main class="p-6 lg:p-8">
      ${isTrial ? `
      <div class="mb-6 p-4 bg-warning-50 border border-warning-200 rounded-xl flex items-center justify-between animate-in">
        <div class="flex items-center gap-3">
          <svg class="h-5 w-5 text-warning-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          <div>
            <p class="font-medium text-warning-800">Trial ends in ${trialDaysLeft} days</p>
            <p class="text-body-sm text-warning-700">Upgrade now to lock in $29/mo forever</p>
          </div>
        </div>
        <a href="/dashboard/billing" class="btn-primary shrink-0">Upgrade Now</a>
      </div>
      ` : ''}

      <!-- Stats Grid -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        ${[
          { label: 'Total Forms', value: stats.totalForms, icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'brand' },
          { label: 'Total Leads', value: stats.totalSubmissions, icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', color: 'success' },
          { label: 'This Month', value: stats.thisMonth, icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', color: 'brand' },
          { label: 'Last 7 Days', value: stats.lastWeek, icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', color: 'violet' },
        ].map(s => `
        <article class="card-padded animate-in">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-caption text-neutral-500 mb-1">${s.label}</p>
              <p class="text-display-sm font-bold text-neutral-900">${s.value}</p>
            </div>
            <div class="w-12 h-12 rounded-xl bg-${s.color}-50 flex items-center justify-center">
              <svg class="h-6 w-6 text-${s.color}-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${s.icon}"/></svg>
            </div>
          </div>
        </article>
        `).join('')}
      </div>

      <!-- Quick Actions + Recent Forms -->
      <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2 card-padded animate-in">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-heading-md text-neutral-900">Recent Forms</h2>
            <a href="/dashboard/forms/new" class="btn-primary">Create Form</a>
          </div>
          ${forms.length ? `
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Form</th>
                  <th class="hidden sm:table-cell">Template</th>
                  <th class="hidden md:table-cell">CRM</th>
                  <th class="text-right">Submissions</th>
                  <th class="text-right">Views</th>
                  <th class="text-right">Status</th>
                  <th class="w-16 text-right"></th>
                </tr>
              </thead>
              <tbody>
                ${forms.slice(0, 10).map(f => `
                <tr>
                  <td>
                    <div class="font-medium text-neutral-900">${f.name}</div>
                    <div class="text-body-xs text-neutral-500">${f.slug}</div>
                  </td>
                  <td class="hidden sm:table-cell"><span class="badge-neutral">${f.template_id || 'Custom'}</span></td>
                  <td class="hidden md:table-cell"><span class="badge-primary">${f.crm_type.toUpperCase()}</span></td>
                  <td class="text-right font-mono text-body-md text-neutral-900">${f.submissions || 0}</td>
                  <td class="text-right font-mono text-body-md text-neutral-500">${f.views || 0}</td>
                  <td class="text-right">
                    <span class="badge ${f.is_active ? 'badge-success' : 'badge-neutral'}">${f.is_active ? 'Active' : 'Paused'}</span>
                  </td>
                  <td class="text-right">
                    <a href="/dashboard/forms/${f.id}" class="btn-icon" aria-label="View ${f.name}"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></a>
                  </td>
                </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="mt-4 text-right">
            <a href="/dashboard/forms" class="link">View all forms →</a>
          </div>
          ` : `
          <div class="text-center py-12">
            <svg class="h-16 w-16 text-neutral-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <h3 class="text-heading-md text-neutral-900 mb-2">No forms yet</h3>
            <p class="text-body-md text-neutral-500 mb-6">Create your first lead capture form</p>
            <a href="/dashboard/forms/new" class="btn-primary">Create Form</a>
          </div>
          `}
        </section>

        <!-- Quick Stats Sidebar -->
        <aside class="space-y-4 animate-in">
          <article class="card-padded">
            <h3 class="text-heading-sm text-neutral-900 mb-4">Quick Actions</h3>
            <div class="space-y-2">
              <a href="/dashboard/forms/new" class="btn-secondary w-full justify-start"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg> Create Form</a>
              <a href="/dashboard/forms" class="btn-secondary w-full justify-start"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Manage Forms</a>
              <a href="/dashboard/team" class="btn-secondary w-full justify-start ${(agent.plan === 'pro' || agent.plan === 'team') ? '' : 'opacity-50 pointer-events-none'}"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg> Team Members</a>
              <a href="/dashboard/api-keys" class="btn-secondary w-full justify-start"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743"/></svg> API Keys</a>
              <a href="/dashboard/billing" class="btn-secondary w-full justify-start"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg> Billing</a>
            </div>
          </article>

          ${isTrial ? `
          <article class="card-padded bg-warning-50 border-warning-200">
            <h3 class="text-heading-sm text-warning-800 mb-2">Trial Status</h3>
            <div class="mb-4">
              <div class="h-2 bg-warning-200 rounded-full overflow-hidden">
                <div class="h-full bg-warning-500 rounded-full transition-all duration-500" style="width: ${Math.max(0, 100 - (trialDaysLeft / 14) * 100)}%"></div>
              </div>
              <p class="text-body-sm text-warning-700 mt-2">${trialDaysLeft} days remaining</p>
            </div>
            <a href="/dashboard/billing" class="btn-warning w-full">Upgrade Now</a>
          </article>
          ` : ''}

          <article class="card-padded">
            <h3 class="text-heading-sm text-neutral-900 mb-4">Plan: ${agent.plan.charAt(0).toUpperCase() + agent.plan.slice(1)}</h3>
            <div class="space-y-2 text-body-sm">
              <div class="flex justify-between"><span class="text-neutral-500">Forms</span><span class="font-medium">${agent.plan === 'starter' ? 'Unlimited' : 'Unlimited'}</span></div>
              <div class="flex justify-between"><span class="text-neutral-500">Team Members</span><span class="font-medium">${agent.plan === 'starter' ? '1' : agent.plan === 'pro' ? '5' : '10'}</span></div>
              <div class="flex justify-between"><span class="text-neutral-500">Showing Scheduler</span><span class="font-medium">${agent.plan === 'starter' ? '✗' : '✓'}</span></div>
              <div class="flex justify-between"><span class="text-neutral-500">Weighted Routing</span><span class="font-medium">${agent.plan === 'team' ? '✓' : '✗'}</span></div>
            </div>
            ${agent.plan === 'starter' ? `<a href="/dashboard/billing" class="btn-primary w-full mt-4">Upgrade Plan</a>` : ''}
          </article>
        </aside>
      </div>
    </main>
  </div>
  <script>
    // Mobile sidebar toggle
    const sidebarToggle = document.getElementById('sidebar-toggle')
    const sidebar = document.getElementById('sidebar')
    const overlay = document.getElementById('sidebar-overlay')
    if (sidebarToggle && sidebar && overlay) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full')
        overlay.classList.toggle('hidden')
      })
      overlay.addEventListener('click', () => {
        sidebar.classList.add('-translate-x-full')
        overlay.classList.add('hidden')
      })
    }
  </script>
</body>
</html>
  `
}

function renderSidebar(agent: any, active: string) {
  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { href: '/dashboard/forms', label: 'Forms', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { href: '/dashboard/team', label: 'Team', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', plan: ['pro', 'team'] },
    { href: '/dashboard/api-keys', label: 'API Keys', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743' },
    { href: '/dashboard/billing', label: 'Billing', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { href: '/dashboard/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ]

  return `
<aside id="sidebar" class="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-neutral-200 transform -translate-x-full lg:translate-x-0 transition-transform duration-300 ease-out-expo" aria-label="Sidebar navigation">
  <div class="flex flex-col h-full">
    <!-- Logo -->
    <div class="p-6 border-b border-neutral-200">
      <a href="/dashboard" class="flex items-center gap-2" aria-label="Conduit home">
        <div class="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
          <svg class="h-6 w-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
        </div>
        <span class="text-xl font-bold text-neutral-900">Conduit</span>
      </a>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
      ${navItems.map(item => {
        const isActive = active === item.href.replace('/dashboard', '') || (item.href === '/dashboard' && active === 'dashboard')
        const hasPlan = item.plan && !item.plan.includes(agent.plan)
        return `
        <a href="${item.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-medium transition-all duration-200 ${isActive ? 'bg-brand-50 text-brand-700' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'} ${hasPlan ? 'opacity-50 pointer-events-none' : ''}" ${hasPlan ? 'aria-disabled="true"' : ''}>
          <svg class="h-5 w-5 shrink-0 ${isActive ? 'text-brand-600' : 'text-neutral-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${item.icon}"/></svg>
          ${item.label}
          ${hasPlan ? '<span class="ml-auto badge-warning text-xs">Pro</span>' : ''}
        </a>
        `
      }).join('')}
    </nav>

    <!-- User Menu -->
    <div class="p-4 border-t border-neutral-200">
      <div class="flex items-center gap-3 px-3 py-2">
        <div class="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
          <span class="text-brand-600 font-semibold text-body-md">${agent.name.charAt(0).toUpperCase()}</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-body-sm font-medium text-neutral-900 truncate">${agent.name}</p>
          <p class="text-body-xs text-neutral-500 truncate">${agent.email}</p>
        </div>
      </div>
      <form action="/auth/logout" method="POST" class="mt-3">
        <button type="submit" class="btn-ghost w-full justify-start"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg> Sign Out</button>
      </form>
    </div>
  </div>
</aside>

<!-- Mobile overlay -->
<div id="sidebar-overlay" class="fixed inset-0 bg-neutral-900/50 z-40 hidden lg:hidden" aria-hidden="true"></div>
  `
}

function renderTopBar(agent: any) {
  return `
<header class="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-neutral-200" role="banner">
  <div class="flex items-center justify-between h-16 px-4 lg:px-8">
    <div class="flex items-center gap-4">
      <button id="sidebar-toggle" class="lg:hidden btn-ghost p-2" aria-label="Open menu" aria-expanded="false" aria-controls="sidebar">
        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <a href="/dashboard" class="flex items-center gap-2 shrink-0 lg:hidden" aria-label="Conduit home">
        <div class="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center">
          <svg class="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
        </div>
        <span class="text-xl font-bold text-neutral-900">Conduit</span>
      </a>
    </div>
    <div class="flex items-center gap-3">
      <div class="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-neutral-50 rounded-xl">
        <svg class="h-4 w-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
        <span class="text-body-xs font-medium text-neutral-600">${agent.plan.charAt(0).toUpperCase() + agent.plan.slice(1)}</span>
      </div>
      <div class="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center">
        <span class="text-brand-600 font-semibold text-body-sm">${agent.name.charAt(0).toUpperCase()}</span>
      </div>
    </div>
  </div>
</header>
  `
}

// Additional render functions for other pages would go here...
// For brevity, I'll add the essential ones

function renderFormsList(data: any) {
  const { agent, forms } = data
  return renderDashboard({ agent, stats: { totalForms: forms.length, totalSubmissions: 0, thisMonth: 0, lastWeek: 0, conversionRate: '0' }, forms, recentSubmissions: [] })
    .replace('Dashboard - Conduit', 'Forms - Conduit')
    .replace('id="sidebar"', 'id="sidebar"')
}

function renderFormBuilder(data: any) {
  const { agent, form, templates } = data
  const isEdit = !!form
  const template = form?.template_id ? templates.find(t => t.id === form.template_id) : null
  const fields = template?.fields || []

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isEdit ? 'Edit Form' : 'Create Form'} - Conduit</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>body { font-family: 'Inter', sans-serif; }</style>
</head>
<body class="bg-neutral-25">
  ${renderSidebar(agent, 'forms')}
  <div class="lg:pl-64 min-h-screen">
    ${renderTopBar(agent)}
    <main class="p-6 lg:p-8">
      <div class="max-w-4xl mx-auto">
        <div class="mb-8">
          <a href="/dashboard/forms" class="btn-ghost mb-4"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg> Back to Forms</a>
          <h1 class="text-display-sm text-neutral-900 mb-2">${isEdit ? 'Edit Form' : 'Create New Form'}</h1>
          <p class="text-body-lg text-neutral-600">${isEdit ? 'Update your form settings' : 'Build a lead capture form in minutes'}</p>
        </div>

        <form id="form-builder" class="space-y-8" novalidate>
          <!-- Basic Info -->
          <section class="card-padded animate-in">
            <h2 class="text-heading-md text-neutral-900 mb-6">Basic Information</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="form-group">
                <label for="name" class="label">Form Name</label>
                <input type="text" id="name" name="name" class="input" required value="${form?.name || ''}" placeholder="e.g., Buyer Inquiry Form">
              </div>
              <div class="form-group">
                <label for="template_id" class="label">Template</label>
                <select id="template_id" name="template_id" class="select">
                  <option value="">Custom (blank)</option>
                  ${templates.map(t => `<option value="${t.id}" ${form?.template_id === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group mt-4">
              <label for="slug" class="label">Slug (URL)</label>
              <div class="flex items-center gap-2">
                <span class="px-3 py-2 bg-neutral-100 rounded-lg text-neutral-500 text-body-sm">${c.env.APP_URL}/forms/</span>
                <input type="text" id="slug" name="slug" class="input flex-1" value="${form?.slug || ''}" placeholder="auto-generated-from-name">
              </div>
              <p class="input-hint">Leave empty to auto-generate from name</p>
            </div>
          </section>

          <!-- CRM Configuration -->
          <section class="card-padded animate-in">
            <h2 class="text-heading-md text-neutral-900 mb-6">CRM Integration</h2>
            <div class="form-group">
              <label class="label">CRM Platform</label>
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                ${['fub', 'liondesk', 'kvcore', 'hubspot', 'generic'].map(crm => `
                <label class="relative flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${form?.crm_type === crm ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 hover:border-brand-300'}">
                  <input type="radio" name="crm_type" value="${crm}" class="sr-only" ${form?.crm_type === crm ? 'checked' : ''} required>
                  <div class="text-center">
                    <div class="font-medium text-neutral-900 capitalize">${crm === 'fub' ? 'Follow Up Boss' : crm === 'kvcore' ? 'kvCORE' : crm}</div>
                    <div class="text-body-xs text-neutral-500 mt-1">${crm === 'generic' ? 'Any webhook' : 'Native fields'}</div>
                  </div>
                </label>
                `).join('')}
              </div>
            </div>
            <div class="form-group mt-4" id="webhook-config">
              <label for="webhook_url" class="label">Webhook URL</label>
              <input type="url" id="webhook_url" name="crm_config[webhook_url]" class="input" placeholder="https://your-crm.com/webhook/endpoint" required value="${form ? JSON.parse(form.crm_config).webhook_url || '' : ''}">
              <p class="input-hint">Found in your CRM settings under Webhooks / Integrations</p>
            </div>
            <div class="form-group">
              <label for="auth_token" class="label">Auth Token (Optional)</label>
              <div class="relative">
                <input type="password" id="auth_token" name="crm_config[auth_token]" class="input pr-12" placeholder="Bearer token or API key" value="${form ? JSON.parse(form.crm_config).auth_token || '' : ''}">
                <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600" onclick="togglePassword('auth_token', this)"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>
              </div>
              <p class="input-hint">Leave empty if your CRM doesn't require authentication</p>
            </div>
          </section>

          <!-- Field Mapping -->
          <section class="card-padded animate-in">
            <h2 class="text-heading-md text-neutral-900 mb-6">Field Mapping</h2>
            <p class="text-body-md text-neutral-500 mb-6">Map form fields to your CRM fields. Leave blank to use defaults.</p>
            <div class="grid gap-4 sm:grid-cols-2" id="field-mapping">
              ${fields.map(f => `
              <div class="form-group">
                <label for="map_${f.key}" class="label">${f.label} <span class="text-neutral-400">→</span></label>
                <input type="text" id="map_${f.key}" name="crm_config[field_mapping][${f.key}]" class="input" placeholder="${f.key}" value="${form ? JSON.parse(form.crm_config).field_mapping?.[f.key] || '' : ''}">
              </div>
              `).join('')}
            </div>
          </section>

          <!-- Settings -->
          <section class="card-padded animate-in">
            <h2 class="text-heading-md text-neutral-900 mb-6">Form Settings</h2>
            <div class="space-y-4">
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="settings[showing_scheduler]" class="checkbox" ${form ? JSON.parse(form.settings).showing_scheduler : false}>
                <div>
                  <p class="font-medium text-neutral-900">Enable Showing Scheduler</p>
                  <p class="text-body-sm text-neutral-500">Allow leads to book showings directly in the form</p>
                </div>
              </label>
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="settings[mls_disclaimer]" class="checkbox" ${form ? JSON.parse(form.settings).mls_disclaimer !== false : true} checked>
                <div>
                  <p class="font-medium text-neutral-900">MLS Compliance Disclaimer</p>
                  <p class="text-body-sm text-neutral-500">Auto-inject required disclaimer based on state/province</p>
                </div>
              </label>
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="settings[team_routing]" class="checkbox" ${form ? JSON.parse(form.settings).team_routing : false} ${(agent.plan !== 'pro' && agent.plan !== 'team') ? 'disabled' : ''}>
                <div>
                  <p class="font-medium text-neutral-900">Team Round-Robin Routing</p>
                  <p class="text-body-sm text-neutral-500">Distribute leads evenly across team members (Pro/Team only)</p>
                </div>
              </label>
              <div class="form-group">
                <label for="redirect_url" class="label">Redirect URL (Optional)</label>
                <input type="url" id="redirect_url" name="settings[redirect_url]" class="input" placeholder="https://yoursite.com/thank-you" value="${form ? JSON.parse(form.settings).redirect_url || '' : ''}">
                <p class="input-hint">Where to send leads after submission. Leave blank to show success message.</p>
              </div>
            </div>
          </section>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-4 animate-in">
            <a href="/dashboard/forms" class="btn-secondary">Cancel</a>
            <button type="submit" class="btn-primary" id="save-btn">
              <span class="btn-text">${isEdit ? 'Save Changes' : 'Create Form'}</span>
              <span class="btn-loader hidden flex items-center gap-2"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Saving...</span>
            </button>
          </div>
        </form>
      </div>
    </main>
  </div>
  <script>
    // Form submission
    document.getElementById('form-builder').addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = document.getElementById('save-btn')
      const btnText = btn.querySelector('.btn-text')
      const btnLoader = btn.querySelector('.btn-loader')
      const formData = new FormData(e.target)
      const data = {
        name: formData.get('name'),
        template_id: formData.get('template_id') || null,
        crm_type: formData.get('crm_type'),
        crm_config: {
          webhook_url: formData.get('crm_config[webhook_url]'),
          field_mapping: {},
          auth_token: formData.get('crm_config[auth_token]') || undefined
        },
        settings: {
          showing_scheduler: formData.has('settings[showing_scheduler]'),
          mls_disclaimer: formData.has('settings[mls_disclaimer]'),
          team_routing: formData.has('settings[team_routing]'),
          redirect_url: formData.get('settings[redirect_url]') || undefined
        }
      }
      // Collect field mappings
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('crm_config[field_mapping][')) {
          const fieldKey = key.match(/\\[(.*?)\\]/)[1]
          data.crm_config.field_mapping[fieldKey] = value
        }
      }

      btn.disabled = true
      btnText.classList.add('hidden')
      btnLoader.classList.remove('hidden')

      try {
        const response = await fetch('/api/forms${isEdit ? '/' + form.id : ''}', {
          method: '${isEdit ? 'PUT' : 'POST'}',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          credentials: 'include'
        })
        if (response.ok) {
          window.location.href = '/dashboard/forms'
        } else {
          throw new Error('Failed to save')
        }
      } catch (err) {
        btn.disabled = false
        btnText.classList.remove('hidden')
        btnLoader.classList.add('hidden')
        alert('Failed to save form')
      }
    })

    // Template change -> reload page with new fields
    document.getElementById('template_id').addEventListener('change', (e) => {
      const url = new URL(window.location)
      url.searchParams.set('template', e.target.value)
      if (form) url.searchParams.set('edit', form.id)
      window.location.href = url
    })

    // Password toggle
    window.togglePassword = function(id, btn) {
      const field = document.getElementById(id)
      const icon = btn.querySelector('svg')
      if (field.type === 'password') {
        field.type = 'text'
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 01.002-1.084M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18a6 6 0 006-6v-3m-6 3a6 6 0 01-6-6"/>'
      } else {
        field.type = 'password'
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>'
      }
    }
  </script>
</body>
</html>
  `
}

function renderFormDetail(data: any) {
  const { agent, form, submissions } = data
  const embedUrl = `${c.env.APP_URL}/forms/${form.slug}`
  return renderDashboard({ agent, stats: {}, forms: [], recentSubmissions: [] })
    .replace('Dashboard - Conduit', `${form.name} - Conduit`)
}

function renderTeamPage(data: any) {
  const { agent, members } = data
  return renderDashboard({ agent, stats: {}, forms: [], recentSubmissions: [] })
    .replace('Dashboard - Conduit', 'Team - Conduit')
}

function renderApiKeysPage(data: any) {
  const { agent, keys } = data
  return renderDashboard({ agent, stats: {}, forms: [], recentSubmissions: [] })
    .replace('Dashboard - Conduit', 'API Keys - Conduit')
}

function renderBillingPage(data: any) {
  const { agent } = data
  const trialDaysLeft = agent.trial_ends_at ? Math.max(0, Math.ceil((agent.trial_ends_at - Date.now()) / (24 * 60 * 60 * 1000))) : 0
  const isTrial = trialDaysLeft > 0 && agent.subscription_status === 'trialing'

  const plans = [
    { id: 'starter', name: 'Starter', inr: 2499, usd: 29, features: ['Unlimited forms & submissions', 'All 4 CRM integrations', '5 templates included', 'MLS disclaimer auto-inject', 'Email notifications'], cta: 'Start Free Trial' },
    { id: 'pro', name: 'Pro', inr: 6999, usd: 79, features: ['Everything in Starter', 'Showing scheduler', 'Team routing (up to 5 agents)', 'Custom redirect URLs', 'Priority support'], cta: 'Start Free Trial', popular: true },
    { id: 'team', name: 'Team', inr: 16999, usd: 199, features: ['Everything in Pro', 'Up to 10 team members', 'Weighted round-robin routing', 'Team analytics dashboard', 'Dedicated support'], cta: 'Contact Sales' },
  ]

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Billing - Conduit</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>body { font-family: 'Inter', sans-serif; }</style>
</head>
<body class="bg-neutral-25">
  ${renderSidebar('billing')}
  <div class="lg:pl-64 min-h-screen">
    ${renderTopBar({ name: 'User', email: 'user@example.com', plan: 'starter' })}
    <main class="p-6 lg:p-8">
      <div class="max-w-6xl mx-auto">
        <div class="mb-8">
          <a href="/dashboard" class="btn-ghost mb-4"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg> Back to Dashboard</a>
          <h1 class="text-display-sm text-neutral-900 mb-2">Billing & Subscription</h1>
          <p class="text-body-lg text-neutral-600">Manage your plan and payment method</p>
        </div>

        ${isTrial ? `
        <div class="mb-8 p-6 bg-warning-50 border border-warning-200 rounded-2xl animate-in">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-warning-100 flex items-center justify-center">
                <svg class="h-5 w-5 text-warning-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
              </div>
              <div>
                <h3 class="text-heading-md text-warning-800">Trial ends in ${Math.max(0, trialDaysLeft)} days</h3>
                <p class="text-body-sm text-warning-700 mt-1">Upgrade now to lock in ₹2,499/mo (₹29/mo) forever</p>
              </div>
            </div>
            <a href="#pricing" class="btn-warning shrink-0">Upgrade Now</a>
          </div>
        ` : ''}

        <!-- Current Plan -->
        <div class="mb-8 animate-in">
          <h2 class="text-heading-md text-neutral-900 mb-6">Current Plan</h2>
          <article class="card-padded ${agent.plan === 'pro' ? 'ring-2 ring-brand-500' : ''}">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-heading-lg text-neutral-900 capitalize">${agent.plan}</h3>
                <p class="text-body-md text-neutral-500 mt-1">${agent.subscription_status === 'active' ? 'Active subscription' : agent.subscription_status === 'trialing' ? 'Trial period' : agent.subscription_status}</p>
              </div>
              <div class="text-right">
                ${agent.payment_provider ? `
                <div class="flex items-center gap-2 mb-2">
                  <span class="badge-primary">${agent.payment_provider.charAt(0).toUpperCase() + agent.payment_provider.slice(1)}</span>
                  <span class="text-body-sm text-neutral-500">${agent.payment_customer_id || 'Connected'}</span>
                </div>
                ` : ''}
                ${agent.plan !== 'starter' ? `
                <a href="/api/payments/cancel" class="btn-ghost text-error-600 hover:text-error-700" onclick="return confirm('Cancel subscription? You will lose access to premium features at the end of the billing period.')">Cancel Subscription</a>
                ` : ''}
              </div>
            </div>
          </article>
        </div>

        <!-- Pricing Plans -->
        <div id="pricing" class="animate-in">
          <h2 class="text-heading-lg text-neutral-900 mb-6">Choose Your Plan</h2>
          <p class="text-body-lg text-neutral-600 mb-8 max-w-2xl">All plans include unlimited forms, submissions, and CRM integrations. Choose your preferred payment provider at checkout.</p>

          <div class="grid gap-6 lg:grid-cols-3 max-w-5xl mx-auto">
            <article class="card-padded relative">
              <h3 class="text-heading-md text-neutral-900 mb-2">Starter</h3>
              <p class="text-body-sm text-neutral-500 mb-6">Perfect for solo agents getting started</p>
              <div class="mb-6">
                <span class="text-display-md font-bold text-neutral-900">₹2,499</span>
                <span class="text-body-lg text-neutral-500 ml-1">/mo</span>
                <div class="text-body-sm text-neutral-400 mt-1">($29/mo via PayPal)</div>
              </div>
              <ul class="space-y-3 mb-8" role="list">
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Unlimited forms & submissions</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">All 4 CRM integrations</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">5 templates included</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">MLS disclaimer auto-inject</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Email notifications</span></li>
              </ul>
              <button class="btn-primary w-full select-plan" data-plan="starter" data-price-inr="249900" data-price-usd="2900">Start Free Trial</button>
            </article>

            <article class="card-padded relative ring-2 ring-brand-500 shadow-lg">
              <div class="absolute -top-3 left-1/2 -translate-x-1/2 badge-warning">Most Popular</div>
              <h3 class="text-heading-md text-neutral-900 mb-2">Pro</h3>
              <p class="text-body-sm text-neutral-500 mb-6">For agents who want showing scheduling & team features</p>
              <div class="mb-6">
                <span class="text-display-md font-bold text-neutral-900">₹6,999</span>
                <span class="text-body-lg text-neutral-500 ml-1">/mo</span>
                <div class="text-body-sm text-neutral-400 mt-1">($79/mo via PayPal)</div>
              </div>
              <ul class="space-y-3 mb-8" role="list">
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Everything in Starter</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Showing scheduler</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Team routing (up to 5 agents)</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Custom redirect URLs</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Priority support</span></li>
              </ul>
              <button class="btn-primary w-full select-plan" data-plan="pro" data-price-inr="699900" data-price-usd="7900">Start Free Trial</button>
            </article>

            <article class="card-padded relative">
              <h3 class="text-heading-md text-neutral-900 mb-2">Team</h3>
              <p class="text-body-sm text-neutral-500 mb-6">For growing teams needing analytics & weighted routing</p>
              <div class="mb-6">
                <span class="text-display-md font-bold text-neutral-900">₹16,999</span>
                <span class="text-body-lg text-neutral-500 ml-1">/mo</span>
                <div class="text-body-sm text-neutral-400 mt-1">($199/mo via PayPal)</div>
              </div>
              <ul class="space-y-3 mb-8" role="list">
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Everything in Pro</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Up to 10 team members</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Weighted round-robin routing</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Team analytics dashboard</span></li>
                <li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">Dedicated support</span></li>
              </ul>
              <button class="btn-secondary w-full" onclick="alert('Contact sales for Team plan')">Contact Sales</button>
            </article>
          </div>

          <!-- Payment Provider Info -->
          <div class="mt-12 p-6 bg-brand-50 rounded-2xl border border-brand-200">
            <h3 class="text-heading-md text-brand-900 mb-4">Choose Your Payment Provider at Checkout</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <article class="card-padded">
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <svg class="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                  </div>
                  <div>
                    <h4 class="font-semibold text-neutral-900">Razorpay</h4>
                    <p class="text-body-sm text-neutral-500">For INR payments (India)</p>
                  </div>
                </div>
                <ul class="space-y-2 text-body-sm text-neutral-600">
                  <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>UPI, Cards, Net Banking, Wallets</li>
                  <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>Instant activation</li>
                  <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>GST compliant invoices</li>
                </ul>
              </article>
              <article class="card-padded">
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                    <svg class="h-5 w-5 text-orange-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                  </div>
                  <div>
                    <h4 class="font-semibold text-neutral-900">PayPal</h4>
                    <p class="text-body-sm text-neutral-500">For USD payments (International)</p>
                  </div>
                </div>
                <ul class="space-y-2 text-body-sm text-neutral-600">
                  <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>Credit/Debit cards, PayPal balance</li>
                  <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>Buyer protection</li>
                  <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>Global availability</li>
                </ul>
              </article>
            </div>
          </div>

          <!-- Founding Member Note -->
          <div class="mt-12 p-8 bg-brand-50 rounded-2xl border border-brand-200 text-center">
            <h3 class="text-heading-md text-brand-900 mb-2">Join 50 Founding Agents</h3>
            <p class="text-body-lg text-brand-700 mb-4">Lock in ₹2,499/mo ($29/mo) forever. Price increases to ₹4,999/mo after founding spots fill.</p>
            <button class="btn-primary inline-flex select-plan" data-plan="starter" data-price-inr="249900" data-price-usd="2900">Claim Your Spot</button>
          </div>
        </div>
      </div>
    </main>
  </div>
  <script>
    // Plan selection handler
    document.querySelectorAll('.select-plan').forEach(btn => {
      btn.addEventListener('click', async () => {
        const plan = btn.dataset.plan
        const priceInr = parseInt(btn.dataset.priceInr)
        const priceUsd = parseInt(btn.dataset.priceUsd)
        
        // Determine available providers based on user location/currency
        // For now, show both and let user choose at checkout
        const providers = await fetch('/api/payments/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ country: 'IN', currency: 'INR' }) // TODO: detect user location
        }).then(r => r.json())
        
        if (providers.providers.length === 1) {
          // Only one provider, go directly to checkout
          startCheckout(providers.providers[0].id)
        } else {
          // Show provider selection modal
          showProviderModal(plan, priceInr, priceUsd, providers.providers)
        }
      })
    })

    async function startCheckout(provider) {
      const plan = event.target.dataset.plan
      const priceInr = parseInt(event.target.dataset.priceInr)
      const priceUsd = parseInt(event.target.dataset.priceUsd)
      const currency = provider === 'razorpay' ? 'INR' : 'USD'
      const amount = provider === 'razorpay' ? priceInr : priceUsd
      const billingCycle = 'monthly'
      
      const btn = event.target
      const originalText = btn.textContent
      btn.disabled = true
      btn.textContent = 'Redirecting...'
      
      try {
        const response = await fetch('/api/payments/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ provider, plan, billingCycle, currency, idempotencyKey: 'order_' + crypto.randomUUID() })
        })
        
        const result = await response.json()
        
        if (result.checkoutUrl) {
          // PayPal redirect
          window.location.href = result.checkoutUrl
        } else if (result.razorpayKeyId) {
          // Razorpay checkout
          const options = {
            key: result.razorpayKeyId,
            amount: amount,
            currency: currency,
            name: 'Conduit',
            description: plan.charAt(0).toUpperCase() + plan.slice(1) + ' Plan',
            order_id: result.orderId,
            handler: async function (response) {
              // Verify payment
              const verifyResponse = await fetch('/api/payments/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ provider: 'razorpay', orderId: result.orderId, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature })
              })
              const verifyResult = await verifyResponse.json()
              if (verifyResult.success) {
                window.location.href = '/dashboard/billing?success=1'
              } else {
                alert('Payment verification failed: ' + verifyResult.error)
              }
            },
            prefill: {
              email: '{{agent.email}}',
            },
            theme: { color: '#2563eb' }
          }
          const rzp = new Razorpay(options)
          rzp.open()
        }
      } catch (err) {
        console.error(err)
        alert('Failed to start checkout')
      } finally {
        btn.disabled = false
        btn.textContent = originalText
      }
    }

    function showProviderModal(plan, priceInr, priceUsd, providers) {
      // Simple provider selection - in production, use a proper modal
      const choice = confirm('Choose payment provider:\\n\\nRazorpay (INR ₹' + (priceInr/100).toLocaleString() + ') - Recommended for India\\n\\nPayPal (USD $' + (priceUsd/100).toFixed(2) + ') - For international\\n\\nClick OK for Razorpay, Cancel for PayPal')
      startCheckout(choice ? 'razorpay' : 'paypal')
    }
  </script>
</body>
</html>
  `
}

function renderSettingsPage(data: any) {
  const { agent } = data
  return renderDashboard({ agent, stats: {}, forms: [], recentSubmissions: [] })
    .replace('Dashboard - Conduit', 'Settings - Conduit')
}

export default adminRoutes