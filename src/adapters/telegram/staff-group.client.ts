import type { StaffGroupPort } from '../../application/notifications/notification.service.js';

export type StaffGroupClientConfig = {
  botToken: string;
  staffGroupChatId: string;
  fetch?: typeof fetch;
};

export class StaffGroupTelegramClient implements StaffGroupPort {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: StaffGroupClientConfig) {
    this.fetchFn = config.fetch ?? fetch;
  }

  async sendMessage(text: string): Promise<void> {
    const response = await this.fetchFn(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: this.config.staffGroupChatId, text })
    });

    if (!response.ok) {
      throw new Error(`Telegram staff group message failed with ${response.status}`);
    }
  }
}
