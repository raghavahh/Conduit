export class SchedulerService {
  private env: any

  constructor(env: any) {
    this.env = env
  }

  async createShowingEvent(leadData: any, agentId: string): Promise<{ success: boolean; eventId?: string; error?: string }> {
    const { DB } = this.env

    const agent = await DB.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first()
    if (!agent) return { success: false, error: 'Agent not found' }

    const crmType = leadData.crm_type || 'fub'
    const webhookUrl = leadData.webhook_url

    if (!webhookUrl) return { success: false, error: 'No webhook URL configured' }

    const showingData = {
      type: 'showing_request',
      property_address: leadData.property_address,
      preferred_date: leadData.preferred_date,
      preferred_time: leadData.preferred_time,
      alternate_date: leadData.alternate_date,
      alternate_time: leadData.alternate_time,
      lead: {
        first_name: leadData.first_name,
        last_name: leadData.last_name,
        email: leadData.email,
        phone: leadData.phone,
      },
      notes: leadData.notes,
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(showingData),
      })

      if (response.ok) {
        return { success: true, eventId: `showing_${Date.now()}` }
      }
      return { success: false, error: `HTTP ${response.status}` }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  async getAgentAvailability(agentId: string, date: string): Promise<string[]> {
    const { DB } = this.env
    const member = await DB.prepare('SELECT * FROM team_members WHERE agent_id = ? AND email = ?').bind(agentId, agentId).first()
    
    const defaultHours = ['9:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']
    return member?.availability ? JSON.parse(member.availability) : defaultHours
  }

  async assignToTeamMember(agentId: string, leadData: any): Promise<{ memberId: string; email: string } | null> {
    const { DB } = this.env

    const members = await DB.prepare(`
      SELECT * FROM team_members WHERE agent_id = ? AND is_active = 1
    `).bind(agentId).all()

    if (!members.results?.length) return null

    const totalWeight = members.results.reduce((sum: number, m: any) => sum + (m.routing_weight || 1), 0)
    let random = Math.random() * totalWeight

    for (const member of members.results) {
      random -= (member.routing_weight || 1)
      if (random <= 0) {
        return { memberId: member.id, email: member.email }
      }
    }

    return { memberId: members.results[0].id, email: members.results[0].email }
  }
}