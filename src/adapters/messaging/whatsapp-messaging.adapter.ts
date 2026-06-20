import type { MessagingPort } from '../../ports/messaging.port.js';

/**
 * WhatsApp Business API adapter — placeholder for future implementation.
 * Swap TelegramMessagingAdapter for this in main.ts when ready.
 */
export class WhatsAppMessagingAdapter implements MessagingPort {
  constructor(
    private readonly _accessToken: string,
    private readonly _phoneNumberId: string
  ) {}

  async sendMessage(_recipient: string, _text: string): Promise<void> {
    throw new Error('WhatsAppMessagingAdapter: not implemented yet.');
  }

  async sendFile(_recipient: string, _fileUrl: string, _caption?: string): Promise<void> {
    throw new Error('WhatsAppMessagingAdapter: not implemented yet.');
  }
}
