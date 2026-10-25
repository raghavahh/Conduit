import { EmailService } from './email'
import { CRMService } from './crm'

export class QueueService {
  private env: any

  constructor(env: any) {
    this.env = env
  }

  async processWebhookQueue(batch: any[]): Promise<void> {
    const { DB } = this.env
    const crmService = new CRMService(this.env)

    for (const message of batch) {
      const { submissionId, formId, agentId, crmType, webhookUrl, payload, authToken } = message.body

      const result = await crmService.deliverToCRM(formId, submissionId, crmType, webhookUrl, payload, authToken)

      if (!result.success) {
        await DB.prepare('UPDATE submissions SET status = ? WHERE id = ?').bind('retrying', submissionId).run()
        if (message.body.retryCount < 3) {
          await this.env.WEBHOOK_QUEUE.send({ ...message.body, retryCount: (message.body.retryCount || 0) + 1 })
        } else {
          await DB.prepare('UPDATE submissions SET status = ? WHERE id = ?').bind('failed', submissionId).run()
        }
      }
    }
  }

  async processEmailQueue(batch: any[]): Promise<void> {
    const emailService = new EmailService(this.env.RESEND_API_KEY)

    for (const message of batch) {
      const { agentEmail, formName, leadData, type } = message.body

      let sent = false
      switch (type) {
        case 'lead':
          sent = await emailService.sendLeadNotification(agentEmail, formName, leadData)
          break
        case 'welcome':
          sent = await emailService.sendWelcomeEmail(agentEmail, leadData.name)
          break
        case 'trial_ending':
          sent = await emailService.sendTrialEndingEmail(agentEmail, leadData.name, leadData.daysLeft)
          break
      }

      if (!sent) {
        console.error(`Failed to send ${type} email to ${agentEmail}`)
      }
    }
  }
}