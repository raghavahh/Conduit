import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { templateSchema, TEMPLATES } from '../BACKEND/validation'
import type { Env } from '../types/env'

const publicRoutes = new Hono<{ Bindings: Env }>()

publicRoutes.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Conduit - Lead capture forms for real estate agents. Connect to your CRM (Follow Up Boss, LionDesk, kvCORE, HubSpot) in 5 minutes. No backend, no Zapier, no field mapping headaches.">
  <meta name="theme-color" content="#2563eb">
  <title>Conduit - Lead Forms That Connect to Your CRM in 5 Minutes</title>
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
<body class="bg-neutral-25 text-neutral-900 antialiased">
  <!-- Navigation -->
  <nav class="fixed top-0 left-0 right-0 z-50 glass-strong border-b border-neutral-200/50 backdrop-blur-xl" role="navigation" aria-label="Main navigation">
    <div class="container-main">
      <div class="flex items-center justify-between h-16 lg:h-18">
        <!-- Logo -->
        <a href="/" class="flex items-center gap-2 shrink-0" aria-label="Conduit home">
          <svg class="h-8 w-8 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
          </svg>
          <span class="text-xl font-bold text-neutral-900 tracking-tight">Conduit</span>
        </a>

        <!-- Desktop Navigation -->
        <div class="hidden lg:flex items-center gap-8">
          <a href="#features" class="text-body-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors">Features</a>
          <a href="#templates" class="text-body-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors">Templates</a>
          <a href="#integrations" class="text-body-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors">Integrations</a>
          <a href="#pricing" class="text-body-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors">Pricing</a>
        </div>

        <!-- Actions -->
        <div class="hidden lg:flex items-center gap-3">
          <a href="/auth/login" class="text-body-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors px-3 py-2 rounded-lg">Sign in</a>
          <a href="/auth/register" class="btn-primary" aria-label="Start free trial">Get Started Free</a>
        </div>

        <!-- Mobile Menu Button -->
        <button class="lg:hidden btn-ghost p-2" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
      </div>

      <!-- Mobile Menu -->
      <div id="mobile-menu" class="lg:hidden hidden py-4 border-t border-neutral-200 animate-in">
        <div class="flex flex-col gap-2">
          <a href="#features" class="text-body-md font-medium text-neutral-600 hover:text-neutral-900 px-2 py-2 rounded-lg">Features</a>
          <a href="#templates" class="text-body-md font-medium text-neutral-600 hover:text-neutral-900 px-2 py-2 rounded-lg">Templates</a>
          <a href="#integrations" class="text-body-md font-medium text-neutral-600 hover:text-neutral-900 px-2 py-2 rounded-lg">Integrations</a>
          <a href="#pricing" class="text-body-md font-medium text-neutral-600 hover:text-neutral-900 px-2 py-2 rounded-lg">Pricing</a>
          <div class="pt-2 flex flex-col gap-2">
            <a href="/auth/login" class="text-body-md font-medium text-neutral-600 hover:text-neutral-900 px-2 py-2 rounded-lg">Sign in</a>
            <a href="/auth/register" class="btn-primary w-full text-center">Get Started Free</a>
          </div>
        </div>
      </div>
    </div>
  </nav>

  <main>
    <!-- Hero Section -->
    <section class="relative section-lg pt-28 lg:pt-36 bg-gradient-hero overflow-hidden" aria-labelledby="hero-heading">
      <div class="container-main">
        <div class="max-w-4xl mx-auto text-center">
          <!-- Badge -->
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-caption mb-8 animate-in stagger-1">
            <span class="relative flex h-2 w-2">
              <span class="animate-pulse-soft absolute inset-0 bg-brand-500 rounded-full"></span>
              <span class="relative block h-full w-full bg-brand-500 rounded-full"></span>
            </span>
            <span>New: Showing Scheduler + Team Routing now in Pro</span>
          </div>

          <!-- Headline -->
          <h1 id="hero-heading" class="text-display-lg lg:text-display-xl text-neutral-900 font-bold tracking-tight text-balance mb-6 animate-in stagger-2">
            Lead forms that <span class="text-brand-600">connect</span> to your CRM in 5 minutes
          </h1>

          <!-- Subheadline -->
          <p class="text-body-xl lg:text-body-lg text-neutral-600 max-w-2xl mx-auto mb-10 animate-in stagger-3">
            No backend. No Zapier. No field mapping headaches. Just paste one line of code and leads flow straight into Follow Up Boss, LionDesk, kvCORE, or HubSpot.
          </p>

          <!-- CTA Group -->
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-in stagger-4">
            <a href="/auth/register" class="btn-primary-lg w-full sm:w-auto" aria-label="Start 14-day free trial">
              Start Free - 14 Day Trial
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
              </svg>
            </a>
            <a href="#demo" class="btn-secondary-lg w-full sm:w-auto" aria-label="Watch 5-minute demo">
              Watch 5-Min Demo
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </a>
          </div>

          <!-- Trust Indicators -->
          <p class="text-body-sm text-neutral-500 animate-in stagger-5">
            No credit card required • Cancel anytime • 
            <span class="font-medium text-brand-600">50 founding agents lock in $29/mo forever</span>
          </p>

          <!-- Demo Video Placeholder -->
          <div id="demo" class="mt-20 relative animate-in stagger-6">
            <div class="aspect-video w-full max-w-4xl mx-auto rounded-2xl bg-neutral-900 overflow-hidden shadow-2xl border border-neutral-800 relative">
              <button class="absolute inset-0 flex items-center justify-center w-full h-full bg-gradient-to-br from-neutral-900/80 via-neutral-900/60 to-neutral-900/80 hover:from-neutral-900/90 hover:via-neutral-900/70 hover:to-neutral-900/90 transition-all duration-300" aria-label="Play demo video">
                <div class="text-center">
                  <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 hover:bg-white/30 hover:border-white/50 transition-all duration-300">
                    <svg class="h-8 w-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                  <p class="mt-4 text-body-lg font-medium text-white/90">Watch 5-Min Demo</p>
                  <p class="text-body-sm text-white/60">See how fast it is to set up</p>
                </div>
              </button>
              <div class="absolute bottom-4 right-4 flex gap-2">
                <span class="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-caption text-white/80 border border-white/20">5:23</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Decorative background elements -->
      <div class="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <div class="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-brand-500/10 blur-3xl"></div>
        <div class="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-brand-500/10 blur-3xl"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-500/5 blur-3xl"></div>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="section bg-white" aria-labelledby="features-heading">
      <div class="container-main">
        <div class="text-center max-w-2xl mx-auto mb-16">
          <p class="badge-primary mb-4 animate-in">Built for how agents actually work</p>
          <h2 id="features-heading" class="text-display-sm lg:text-display-md text-neutral-900 mb-4 animate-in stagger-1">Vertical features generic form tools don't have</h2>
          <p class="text-body-lg text-neutral-600 animate-in stagger-2">Every feature is designed specifically for real estate workflows — not generic form building.</p>
        </div>

        <div class="grid-auto-fit">
          <!-- Feature 1: Showing Scheduler -->
          <article class="card-padded card-hover animate-in stagger-1">
            <div class="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
              <svg class="h-7 w-7 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <h3 class="text-heading-md text-neutral-900 mb-2">Showing Scheduler</h3>
            <p class="text-body-md text-neutral-600">Leads book showings directly in the form. Creates calendar events in your CRM automatically. No Calendly link needed.</p>
          </article>

          <!-- Feature 2: MLS Compliance -->
          <article class="card-padded card-hover animate-in stagger-2">
            <div class="w-12 h-12 rounded-xl bg-success-50 flex items-center justify-center mb-4">
              <svg class="h-7 w-7 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <h3 class="text-heading-md text-neutral-900 mb-2">MLS Compliance Auto-Injected</h3>
            <p class="text-body-md text-neutral-600">Required disclaimer text auto-added based on your state/province. Never forget compliance again.</p>
          </article>

          <!-- Feature 3: Team Round-Robin -->
          <article class="card-padded card-hover animate-in stagger-3">
            <div class="w-12 h-12 rounded-xl bg-warning-50 flex items-center justify-center mb-4">
              <svg class="h-7 w-7 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
              </svg>
            </div>
            <h3 class="text-heading-md text-neutral-900 mb-2">Team Round-Robin Routing</h3>
            <p class="text-body-md text-neutral-600">Leads distributed evenly across your team. Weighted routing for senior agents. Pro plan feature.</p>
          </article>

          <!-- Feature 4: Pre-built Templates -->
          <article class="card-padded card-hover animate-in stagger-4">
            <div class="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center mb-4">
              <svg class="h-7 w-7 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <h3 class="text-heading-md text-neutral-900 mb-2">5 Real Estate Templates</h3>
            <p class="text-body-md text-neutral-600">Buyer inquiry, seller valuation, open house sign-in, showing request, referral partner. Ready to use.</p>
          </article>

          <!-- Feature 5: Native CRM Fields -->
          <article class="card-padded card-hover animate-in stagger-5">
            <div class="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
              <svg class="h-7 w-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/>
              </svg>
            </div>
            <h3 class="text-heading-md text-neutral-900 mb-2">Native CRM Field Mapping</h3>
            <p class="text-body-md text-neutral-600">Pre-configured for Follow Up Boss, LionDesk, kvCORE, HubSpot. Zero manual mapping required.</p>
          </article>

          <!-- Feature 6: 5-Minute Setup -->
          <article class="card-padded card-hover animate-in stagger-6">
            <div class="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center mb-4">
              <svg class="h-7 w-7 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <h3 class="text-heading-md text-neutral-900 mb-2">5-Minute Embed</h3>
            <p class="text-body-md text-neutral-600">Copy one line of code. Works on Framer, Wix, Squarespace, WordPress, Webflow, or plain HTML.</p>
          </article>
        </div>
      </div>
    </section>

    <!-- Templates Section -->
    <section id="templates" class="section bg-neutral-25" aria-labelledby="templates-heading">
      <div class="container-main">
        <div class="text-center max-w-2xl mx-auto mb-16">
          <p class="badge-primary mb-4 animate-in">5 templates. Zero setup.</p>
          <h2 id="templates-heading" class="text-display-sm lg:text-display-md text-neutral-900 mb-4 animate-in stagger-1">Pick a template, connect your CRM, embed. Done.</h2>
          <p class="text-body-lg text-neutral-600 animate-in stagger-2">Every template includes pre-mapped CRM fields, MLS disclaimer, and mobile-responsive design.</p>
        </div>

        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          ${TEMPLATES.map((template, index) => `
          <article class="card-padded card-hover animate-in stagger-${(index % 6) + 1}" tabindex="0">
            <div class="flex items-start justify-between mb-4">
              <div>
                <h3 class="text-heading-md text-neutral-900 mb-1">${template.name}</h3>
                <p class="text-body-sm text-neutral-500">${template.description}</p>
              </div>
              <span class="badge-neutral shrink-0">${template.fields.length} fields</span>
            </div>
            <div class="flex flex-wrap gap-2 mb-6">
              ${template.fields.slice(0, 4).map(f => `<span class="px-3 py-1 bg-neutral-50 text-neutral-700 text-body-xs rounded-lg border border-neutral-200">${f.label}${f.required ? ' *' : ''}</span>`).join('')}
              <span class="px-3 py-1 bg-neutral-50 text-neutral-500 text-body-xs rounded-lg border border-neutral-200">+${template.fields.length - 4} more</span>
            </div>
            <div class="pt-4 border-t border-neutral-100">
              <a href="/templates/${template.id}" class="link text-body-sm font-medium">Preview template →</a>
            </div>
          </article>
          `).join('')}
        </div>

        <div class="text-center mt-12 animate-in">
          <a href="/templates" class="link text-body-md font-medium">View all templates →</a>
        </div>
      </div>
    </section>

    <!-- Integrations Section -->
    <section id="integrations" class="section bg-white" aria-labelledby="integrations-heading">
      <div class="container-main">
        <div class="text-center max-w-2xl mx-auto mb-16">
          <p class="badge-primary mb-4 animate-in">Works with your CRM</p>
          <h2 id="integrations-heading" class="text-display-sm lg:text-display-md text-neutral-900 mb-4 animate-in stagger-1">Native integrations. Zero configuration.</h2>
          <p class="text-body-lg text-neutral-600 animate-in stagger-2">Pre-mapped fields for every major real estate CRM. Just paste your webhook URL.</p>
        </div>

        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
          ${[
            { name: 'Follow Up Boss', color: 'bg-blue-50 text-blue-600', desc: 'Native field mapping' },
            { name: 'LionDesk', color: 'bg-green-50 text-green-600', desc: 'snake_case fields' },
            { name: 'kvCORE', color: 'bg-purple-50 text-purple-600', desc: 'CamelCase fields' },
            { name: 'HubSpot', color: 'bg-orange-50 text-orange-600', desc: 'lowercase fields' },
          ].map((crm, i) => `
          <article class="card-padded card-hover text-center animate-in stagger-${i + 1}">
            <div class="w-14 h-14 rounded-xl ${crm.color} flex items-center justify-center mx-auto mb-4">
              <svg class="h-7 w-7" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
            </div>
            <h3 class="text-heading-sm text-neutral-900 mb-1">${crm.name}</h3>
            <p class="text-body-sm text-neutral-500">${crm.desc}</p>
          </article>
          `).join('')}
        </div>

        <div class="text-center mt-10 animate-in">
          <p class="text-body-md text-neutral-600 mb-4">Using a different CRM? <a href="#" class="link">Generic webhook works with any system</a></p>
        </div>
      </div>
    </section>

    <!-- Pricing Section -->
    <section id="pricing" class="section bg-neutral-25" aria-labelledby="pricing-heading">
      <div class="container-main">
        <div class="text-center max-w-2xl mx-auto mb-16">
          <p class="badge-warning mb-4 animate-in">Founding 50 spots available</p>
          <h2 id="pricing-heading" class="text-display-sm lg:text-display-md text-neutral-900 mb-4 animate-in stagger-1">Simple, transparent pricing</h2>
          <p class="text-body-lg text-neutral-600 animate-in stagger-2">All plans include unlimited forms, submissions, and CRM integrations. No hidden fees.</p>
        </div>

        <div class="grid gap-6 lg:grid-cols-3 max-w-5xl mx-auto">
          <!-- Starter -->
          <article class="card-padded relative animate-in stagger-1">
            <div class="mb-6">
              <h3 class="text-heading-md text-neutral-900 mb-2">Starter</h3>
              <p class="text-body-sm text-neutral-500">Perfect for solo agents getting started</p>
            </div>
            <div class="mb-6">
              <span class="text-display-md font-bold text-neutral-900">₹2,499</span>
              <span class="text-body-lg text-neutral-500 ml-1">/mo</span>
              <div class="text-body-sm text-neutral-400 mt-1">($29/mo via PayPal)</div>
            </div>
            <ul class="space-y-3 mb-8" role="list">
              ${[
                'Unlimited forms & submissions',
                'All 4 CRM integrations',
                '5 templates included',
                'MLS disclaimer auto-inject',
                'Email notifications',
              ].map(item => `<li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">${item}</span></li>`).join('')}
            </ul>
            <a href="/auth/register" class="btn-primary w-full" aria-label="Start free trial on Starter plan">Start Free Trial</a>
          </article>

          <!-- Pro -->
          <article class="card-padded relative ring-2 ring-brand-500 shadow-lg animate-in stagger-2">
            <div class="absolute -top-3 left-1/2 -translate-x-1/2 badge-warning">Most Popular</div>
            <div class="mb-6">
              <h3 class="text-heading-md text-neutral-900 mb-2">Pro</h3>
              <p class="text-body-sm text-neutral-500">For agents who want showing scheduling & team features</p>
            </div>
            <div class="mb-6">
              <span class="text-display-md font-bold text-neutral-900">₹6,999</span>
              <span class="text-body-lg text-neutral-500 ml-1">/mo</span>
              <div class="text-body-sm text-neutral-400 mt-1">($79/mo via PayPal)</div>
            </div>
            <ul class="space-y-3 mb-8" role="list">
              ${[
                'Everything in Starter',
                'Showing scheduler',
                'Team routing (up to 5 agents)',
                'Custom redirect URLs',
                'Priority support',
              ].map(item => `<li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">${item}</span></li>`).join('')}
            </ul>
            <a href="/auth/register" class="btn-primary w-full" aria-label="Start free trial on Pro plan">Start Free Trial</a>
          </article>

          <!-- Team -->
          <article class="card-padded relative animate-in stagger-3">
            <div class="mb-6">
              <h3 class="text-heading-md text-neutral-900 mb-2">Team</h3>
              <p class="text-body-sm text-neutral-500">For growing teams needing analytics & weighted routing</p>
            </div>
            <div class="mb-6">
              <span class="text-display-md font-bold text-neutral-900">₹16,999</span>
              <span class="text-body-lg text-neutral-500 ml-1">/mo</span>
              <div class="text-body-sm text-neutral-400 mt-1">($199/mo via PayPal)</div>
            </div>
            <ul class="space-y-3 mb-8" role="list">
              ${[
                'Everything in Pro',
                'Up to 10 team members',
                'Weighted round-robin routing',
                'Team analytics dashboard',
                'Dedicated support',
              ].map(item => `<li class="flex items-start gap-3"><svg class="h-5 w-5 text-success-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span class="text-body-md text-neutral-700">${item}</span></li>`).join('')}
            </ul>
            <a href="/auth/register" class="btn-secondary w-full" aria-label="Contact sales for Team plan">Contact Sales</a>
          </article>
        </div>

        <!-- Payment Provider Info -->
        <div class="mt-12 p-6 bg-brand-50 rounded-2xl border border-brand-200 animate-in">
          <h3 class="text-heading-md text-brand-900 mb-4 text-center">Choose Your Payment Provider at Checkout</h3>
          <div class="grid gap-4 sm:grid-cols-2 max-w-2xl mx-auto">
            <article class="card-padded text-center">
              <div class="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <svg class="h-6 w-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
              </div>
              <h4 class="font-semibold text-neutral-900 mb-1">Razorpay</h4>
              <p class="text-body-sm text-neutral-500 mb-3">For INR payments (India)</p>
              <ul class="space-y-2 text-body-sm text-neutral-600 text-left">
                <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>UPI, Cards, Net Banking, Wallets</li>
                <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>Instant activation</li>
                <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>GST compliant invoices</li>
              </ul>
            </article>
            <article class="card-padded text-center">
              <div class="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center mx-auto mb-3">
                <svg class="h-6 w-6 text-orange-600" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
              </div>
              <h4 class="font-semibold text-neutral-900 mb-1">PayPal</h4>
              <p class="text-body-sm text-neutral-500 mb-3">For USD payments (International)</p>
              <ul class="space-y-2 text-body-sm text-neutral-600 text-left">
                <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>Credit/Debit cards, PayPal balance</li>
                <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>Buyer protection</li>
                <li class="flex items-center gap-2"><svg class="h-4 w-4 text-success-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>Global availability</li>
              </ul>
            </article>
          </div>

        <!-- Founding Member Note -->
        <div class="text-center mt-12 p-8 bg-brand-50 rounded-2xl border border-brand-200 animate-in">
          <p class="text-body-lg text-brand-900 mb-2"><strong>Join 50 founding agents</strong> — Lock in ₹2,499/mo ($29/mo) forever. Price increases to ₹4,999/mo after founding spots fill.</p>
          <a href="/auth/register" class="btn-primary inline-flex">Claim Your Spot</a>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="section-lg bg-brand-600 text-white relative overflow-hidden" aria-labelledby="cta-heading">
      <div class="absolute inset-0 -z-10 opacity-10" aria-hidden="true">
        <svg class="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" stroke-width="0.5"/>
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#grid)"/>
        </svg>
      </div>
      <div class="container-main relative">
        <div class="max-w-3xl mx-auto text-center">
          <h2 id="cta-heading" class="text-display-sm lg:text-display-md font-bold mb-6 animate-in">Ready to capture more leads?</h2>
          <p class="text-body-xl text-brand-100 mb-8 animate-in stagger-1">Join 50 founding agents who get ₹2,499/mo for life. 14-day free trial. No credit card required.</p>
          <a href="/auth/register" class="btn bg-white text-brand-600 hover:bg-brand-50 text-body-lg px-10 py-4 animate-in stagger-2" aria-label="Start free trial">Get Started Free</a>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="bg-neutral-900 text-neutral-400 py-16 lg:py-20" role="contentinfo">
      <div class="container-main">
        <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 mb-12">
          <div class="lg:col-span-2">
            <a href="/" class="flex items-center gap-2 mb-6" aria-label="Conduit home">
              <svg class="h-8 w-8 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
              </svg>
              <span class="text-xl font-bold text-white">Conduit</span>
            </a>
            <p class="text-body-md text-neutral-400 max-w-xs mb-6">Lead capture that connects. Built for real estate agents who want forms that just work.</p>
            <div class="flex gap-4">
              <a href="https://twitter.com" class="text-neutral-500 hover:text-white transition-colors" aria-label="Twitter">
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/></svg>
              </a>
              <a href="https://linkedin.com" class="text-neutral-500 hover:text-white transition-colors" aria-label="LinkedIn">
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 6a2 2 0 100-4 2 2 0 000 4z"/></svg>
              </a>
              <a href="https://github.com" class="text-neutral-500 hover:text-white transition-colors" aria-label="GitHub">
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
              </a>
            </div>
          </div>
          <div>
            <h4 class="font-semibold text-white mb-4">Product</h4>
            <ul class="space-y-2 text-sm">
              <li><a href="#features" class="hover:text-white transition-colors">Features</a></li>
              <li><a href="#templates" class="hover:text-white transition-colors">Templates</a></li>
              <li><a href="#integrations" class="hover:text-white transition-colors">Integrations</a></li>
              <li><a href="#pricing" class="hover:text-white transition-colors">Pricing</a></li>
              <li><a href="/templates" class="hover:text-white transition-colors">All Templates</a></li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-white mb-4">Company</h4>
            <ul class="space-y-2 text-sm">
              <li><a href="#" class="hover:text-white transition-colors">About</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Blog</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Careers</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Press</a></li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-white mb-4">Legal</h4>
            <ul class="space-y-2 text-sm">
              <li><a href="#" class="hover:text-white transition-colors">Privacy</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Terms</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Security</a></li>
              <li><a href="#" class="hover:text-white transition-colors">Cookies</a></li>
            </ul>
          </div>
        </div>
        <div class="pt-8 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p class="text-body-sm text-neutral-500">© 2024 Conduit. Built for real estate agents.</p>
          <div class="flex items-center gap-6 text-body-xs text-neutral-500">
            <a href="#" class="hover:text-white transition-colors">Status</a>
            <a href="#" class="hover:text-white transition-colors">API Docs</a>
            <a href="#" class="hover:text-white transition-colors">Changelog</a>
          </div>
        </div>
      </div>
    </footer>
  </main>

  <!-- Mobile Menu Toggle Script -->
  <script>
    (function() {
      const menuBtn = document.querySelector('[aria-controls="mobile-menu"]');
      const mobileMenu = document.getElementById('mobile-menu');
      if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', function() {
          const isOpen = mobileMenu.classList.toggle('hidden');
          this.setAttribute('aria-expanded', !isOpen);
        });
      }
    })();
  </script>
</body>
</html>
  `)
})

publicRoutes.get('/templates', (c) => {
  return c.json({ templates: TEMPLATES })
})

publicRoutes.get('/templates/:id', (c) => {
  const id = c.req.param('id')
  const template = TEMPLATES.find(t => t.id === id)
  if (!template) return c.json({ error: 'Template not found' }, 404)
  return c.json({ template })
})

export default publicRoutes