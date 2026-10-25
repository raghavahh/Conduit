import { z } from 'zod'

export const agentSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
})

export const formSchema = z.object({
  name: z.string().min(1).max(100),
  template_id: z.string().optional(),
  crm_type: z.enum(['fub', 'liondesk', 'kvcore', 'hubspot', 'generic']),
  crm_config: z.object({
    webhook_url: z.string().url(),
    field_mapping: z.record(z.string()),
    auth_token: z.string().optional(),
  }),
  settings: z.object({
    showing_scheduler: z.boolean().default(false),
    mls_disclaimer: z.boolean().default(true),
    team_routing: z.boolean().default(false),
    redirect_url: z.string().url().optional(),
  }).optional(),
})

export const submissionSchema = z.object({
  form_id: z.string().uuid(),
  data: z.record(z.unknown()),
})

export const apiKeySchema = z.object({
  name: z.string().min(1).max(50),
})

export const teamMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  role: z.enum(['admin', 'agent']).default('agent'),
  routing_weight: z.number().int().min(1).max(100).default(1),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  fields: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(['text', 'email', 'phone', 'textarea', 'select', 'checkbox', 'date', 'hidden']),
    required: z.boolean().default(false),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
  })),
  crm_field_map: z.record(z.string()),
})

export const TEMPLATES: z.infer<typeof templateSchema>[] = [
  {
    id: 'buyer-inquiry',
    name: 'Buyer Inquiry',
    description: 'Capture buyer leads with property preferences',
    fields: [
      { key: 'first_name', label: 'First Name', type: 'text', required: true },
      { key: 'last_name', label: 'Last Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Phone', type: 'phone', required: true },
      { key: 'price_min', label: 'Min Price', type: 'text', required: false },
      { key: 'price_max', label: 'Max Price', type: 'text', required: false },
      { key: 'beds', label: 'Bedrooms', type: 'select', required: false, options: ['1+', '2+', '3+', '4+', '5+'] },
      { key: 'baths', label: 'Bathrooms', type: 'select', required: false, options: ['1+', '2+', '3+', '4+'] },
      { key: 'property_type', label: 'Property Type', type: 'select', required: false, options: ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Land'] },
      { key: 'timeline', label: 'Timeline', type: 'select', required: false, options: ['ASAP', '1-3 months', '3-6 months', '6+ months', 'Just looking'] },
      { key: 'message', label: 'Additional Notes', type: 'textarea', required: false },
    ],
    crm_field_map: {
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      phone: 'phone',
      price_min: 'minPrice',
      price_max: 'maxPrice',
      beds: 'bedrooms',
      baths: 'bathrooms',
      property_type: 'propertyType',
      timeline: 'timeline',
      message: 'notes',
    },
  },
  {
    id: 'seller-valuation',
    name: 'Seller Valuation (CMA Request)',
    description: 'Homeowners requesting home value estimate',
    fields: [
      { key: 'first_name', label: 'First Name', type: 'text', required: true },
      { key: 'last_name', label: 'Last Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Phone', type: 'phone', required: true },
      { key: 'address', label: 'Property Address', type: 'text', required: true },
      { key: 'city', label: 'City', type: 'text', required: true },
      { key: 'state', label: 'State', type: 'text', required: true },
      { key: 'zip', label: 'ZIP Code', type: 'text', required: true },
      { key: 'property_type', label: 'Property Type', type: 'select', required: false, options: ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Land'] },
      { key: 'beds', label: 'Bedrooms', type: 'select', required: false, options: ['1', '2', '3', '4', '5+'] },
      { key: 'baths', label: 'Bathrooms', type: 'select', required: false, options: ['1', '1.5', '2', '2.5', '3', '3.5', '4+'] },
      { key: 'sqft', label: 'Square Footage', type: 'text', required: false },
      { key: 'timeline', label: 'When to Sell', type: 'select', required: false, options: ['ASAP', '1-3 months', '3-6 months', '6-12 months', 'Just curious'] },
    ],
    crm_field_map: {
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      phone: 'phone',
      address: 'address',
      city: 'city',
      state: 'state',
      zip: 'zipCode',
      property_type: 'propertyType',
      beds: 'bedrooms',
      baths: 'bathrooms',
      sqft: 'squareFootage',
      timeline: 'sellTimeline',
    },
  },
  {
    id: 'open-house',
    name: 'Open House Sign-In',
    description: 'Digital sign-in sheet for open houses',
    fields: [
      { key: 'first_name', label: 'First Name', type: 'text', required: true },
      { key: 'last_name', label: 'Last Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Phone', type: 'phone', required: true },
      { key: 'buying_timeline', label: 'Buying Timeline', type: 'select', required: false, options: ['Now', '1-3 months', '3-6 months', '6+ months', 'Not buying'] },
      { key: 'working_with_agent', label: 'Working with an Agent?', type: 'select', required: false, options: ['Yes', 'No', 'Just started'] },
      { key: 'feedback', label: 'Feedback on Property', type: 'textarea', required: false },
    ],
    crm_field_map: {
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      phone: 'phone',
      buying_timeline: 'buyingTimeline',
      working_with_agent: 'hasAgent',
      feedback: 'notes',
    },
  },
  {
    id: 'showing-request',
    name: 'Showing Request',
    description: 'Schedule property showings with calendar integration',
    fields: [
      { key: 'first_name', label: 'First Name', type: 'text', required: true },
      { key: 'last_name', label: 'Last Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Phone', type: 'phone', required: true },
      { key: 'property_address', label: 'Property Address', type: 'text', required: true },
      { key: 'preferred_date', label: 'Preferred Date', type: 'date', required: true },
      { key: 'preferred_time', label: 'Preferred Time', type: 'text', required: true, placeholder: 'e.g., 2:00 PM' },
      { key: 'alternate_date', label: 'Alternate Date', type: 'date', required: false },
      { key: 'alternate_time', label: 'Alternate Time', type: 'text', required: false },
      { key: 'notes', label: 'Special Instructions', type: 'textarea', required: false },
    ],
    crm_field_map: {
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      phone: 'phone',
      property_address: 'propertyAddress',
      preferred_date: 'showingDate',
      preferred_time: 'showingTime',
      alternate_date: 'altShowingDate',
      alternate_time: 'altShowingTime',
      notes: 'notes',
    },
  },
  {
    id: 'referral',
    name: 'Referral Partner',
    description: 'Capture referrals from lenders, inspectors, attorneys',
    fields: [
      { key: 'first_name', label: 'First Name', type: 'text', required: true },
      { key: 'last_name', label: 'Last Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'phone', label: 'Phone', type: 'phone', required: true },
      { key: 'company', label: 'Company', type: 'text', required: false },
      { key: 'role', label: 'Role', type: 'select', required: false, options: ['Lender', 'Inspector', 'Attorney', 'Contractor', 'Title Co', 'Insurance', 'Other'] },
      { key: 'referral_notes', label: 'Referral Details', type: 'textarea', required: false },
    ],
    crm_field_map: {
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      phone: 'phone',
      company: 'company',
      role: 'partnerRole',
      referral_notes: 'notes',
    },
  },
]