import type { MessagingPort } from '../../ports/messaging.port.js';

export class TelegramMessagingAdapter implements MessagingPort {
  constructor(
    private readonly botToken: string,
    private readonly fetch: typeof globalThis.fetch = globalThis.fetch
  ) {}

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.fetch(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
      }
    );
  }

  async sendFile(chatId: string, fileUrl: string, caption?: string): Promise<void> {
    await this.fetch(
      `https://api.telegram.org/bot${this.botToken}/sendDocument`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, document: fileUrl, caption })
      }
    );
  }
}
