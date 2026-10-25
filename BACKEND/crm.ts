export class CRMService {
  private env: any

  constructor(env: any) {
    this.env = env
  }

  async deliverToCRM(formId: string, submissionId: string, crmType: string, webhookUrl: string, payload: any, authToken?: string): Promise<{ success: boolean; response?: any; error?: string }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Conduit/1.0',
      }

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      const responseText = await response.text()
      let responseData
      try {
        responseData = JSON.parse(responseText)
      } catch {
        responseData = responseText
      }

      await this.logWebhook(formId, submissionId, crmType, payload, responseData, response.status, response.ok)

      return {
        success: response.ok,
        response: responseData,
        error: response.ok ? undefined : `HTTP ${response.status}: ${responseText}`,
      }
    } catch (error) {
      await this.logWebhook(formId, submissionId, crmType, payload, null, 0, false, error instanceof Error ? error.message : 'Unknown error')
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  private async logWebhook(formId: string, submissionId: string, crmType: string, payload: any, response: any, statusCode: number, success: boolean, error?: string) {
    const { DB } = this.env
    await DB.prepare(`
      INSERT INTO webhook_logs (id, form_id, submission_id, crm_type, payload, response, status_code, success, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      formId,
      submissionId,
      crmType,
      JSON.stringify(payload),
      JSON.stringify(response),
      statusCode,
      success ? 1 : 0,
      Date.now()
    ).run()

    if (success) {
      await DB.prepare('UPDATE submissions SET status = ?, crm_response = ?, delivered_at = ? WHERE id = ?')
        .bind('delivered', JSON.stringify(response), Date.now(), submissionId).run()
    } else {
      await DB.prepare('UPDATE submissions SET status = ?, retry_count = retry_count + 1 WHERE id = ?')
        .bind('failed', submissionId).run()
    }
  }

  static getCRMFieldMaps(): Record<string, Record<string, string>> {
    return {
      fub: {
        firstName: 'firstName',
        lastName: 'lastName',
        email: 'email',
        phone: 'phone',
        address: 'address',
        city: 'city',
        state: 'state',
        zipCode: 'zipCode',
        minPrice: 'minPrice',
        maxPrice: 'maxPrice',
        bedrooms: 'bedrooms',
        bathrooms: 'bathrooms',
        propertyType: 'propertyType',
        timeline: 'timeline',
        notes: 'notes',
        source: 'source',
        tags: 'tags',
      },
      liondesk: {
        first_name: 'first_name',
        last_name: 'last_name',
        email: 'email',
        phone: 'phone',
        address: 'address',
        city: 'city',
        state: 'state',
        zip: 'zip',
        price_range: 'price_range',
        beds: 'beds',
        baths: 'baths',
        property_type: 'property_type',
        timeframe: 'timeframe',
        comments: 'comments',
        source: 'source',
        tags: 'tags',
      },
      kvcore: {
        firstName: 'firstName',
        lastName: 'lastName',
        email: 'email',
        phone: 'phone',
        address: 'address',
        city: 'city',
        state: 'state',
        zipCode: 'zipCode',
        minPrice: 'minPrice',
        maxPrice: 'maxPrice',
        bedrooms: 'bedrooms',
        bathrooms: 'bathrooms',
        propertyType: 'propertyType',
        timeframe: 'timeframe',
        notes: 'notes',
        leadSource: 'leadSource',
        tags: 'tags',
      },
      hubspot: {
        firstname: 'firstname',
        lastname: 'lastname',
        email: 'email',
        phone: 'phone',
        address: 'address',
        city: 'city',
        state: 'state',
        zip: 'zip',
        minprice: 'minprice',
        maxprice: 'maxprice',
        bedrooms: 'bedrooms',
        bathrooms: 'bathrooms',
        property_type: 'property_type',
        timeline: 'timeline',
        notes: 'notes',
        hs_lead_source: 'hs_lead_source',
      },
      generic: {},
    }
  }
}