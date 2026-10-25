import { Resend } from 'resend'

export class EmailService {
  private resend: Resend
  private fromEmail: string

  constructor(apiKey: string, fromEmail = 'noreply@conduithq.io') {
    this.resend = new Resend(apiKey)
    this.fromEmail = fromEmail
  }

  async sendLeadNotification(agentEmail: string, formName: string, leadData: any): Promise<boolean> {
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: agentEmail,
        subject: `New lead from ${formName}`,
        html: this.generateLeadEmail(formName, leadData),
      })
      return true
    } catch (error) {
      console.error('Email send failed:', error)
      return false
    }
  }

  async sendWelcomeEmail(agentEmail: string, agentName: string): Promise<boolean> {
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: agentEmail,
        subject: 'Welcome to Conduit! 🎉',
        html: this.generateWelcomeEmail(agentName),
      })
      return true
    } catch (error) {
      console.error('Welcome email failed:', error)
      return false
    }
  }

  async sendTrialEndingEmail(agentEmail: string, agentName: string, daysLeft: number): Promise<boolean> {
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: agentEmail,
        subject: `Your Conduit trial ends in ${daysLeft} days`,
        html: this.generateTrialEmail(agentName, daysLeft),
      })
      return true
    } catch (error) {
      console.error('Trial email failed:', error)
      return false
    }
  }

  private generateLeadEmail(formName: string, leadData: any): string {
    const fields = Object.entries(leadData).map(([key, value]) =>
      `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">${key}</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${value}</td></tr>`
    ).join('')

    return `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">New Lead Captured! 🎉</h1>
        </div>
        <div style="padding: 24px;">
          <p style="font-size: 16px; color: #374151;">You received a new lead from <strong>${formName}</strong>.</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
            ${fields}
          </table>
          <div style="margin-top: 24px; text-align: center;">
            <a href="https://conduithq.io/dashboard" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View in Dashboard</a>
          </div>
        </div>
        <div style="background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #6b7280;">
          Powered by Conduit — Lead capture that connects.
        </div>
      </div>
    `
  }

  private generateWelcomeEmail(agentName: string): string {
    return `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Welcome to Conduit, ${agentName}! 🎉</h1>
        </div>
        <div style="padding: 24px;">
          <p style="font-size: 16px; color: #374151;">Your 14-day free trial has started. Here's what to do next:</p>
          <ol style="color: #374151; line-height: 2;">
            <li>Create your first form using one of our 5 templates</li>
            <li>Connect your CRM (Follow Up Boss, LionDesk, kvCORE, or HubSpot)</li>
            <li>Copy the embed code to your website</li>
            <li>Start capturing leads in 5 minutes!</li>
          </ol>
          <div style="margin-top: 24px; text-align: center;">
            <a href="https://conduithq.io/dashboard" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Go to Dashboard</a>
          </div>
        </div>
      </div>
    `
  }

  private generateTrialEmail(agentName: string, daysLeft: number): string {
    return `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f59e0b; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Trial ending in ${daysLeft} days ⏰</h1>
        </div>
        <div style="padding: 24px;">
          <p style="font-size: 16px; color: #374151;">Hi ${agentName}, your Conduit trial ends soon. Don't lose your forms and leads!</p>
          <div style="margin-top: 24px; text-align: center;">
            <a href="https://conduithq.io/dashboard/billing" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Upgrade Now - Lock in $29/mo</a>
          </div>
        </div>
      </div>
    `
  }
}