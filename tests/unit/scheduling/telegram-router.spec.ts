import { describe, expect, it } from 'vitest';
import { InMemoryConversationStateStore } from '../../../src/domain/conversation/conversation-state.js';
import { StaticStaffAllowlistStore, TelegramUpdateRouter } from '../../../src/delivery/telegram/router.js';

describe('TelegramUpdateRouter', () => {
  it('denies unauthorized staff commands', async () => {
    const router = new TelegramUpdateRouter(new InMemoryConversationStateStore(), new StaticStaffAllowlistStore([]));

    const result = await router.route({
      update_id: 1,
      message: {
        message_id: 10,
        text: '/staff config',
        chat: { id: 100, type: 'private' },
        from: { id: 200 }
      }
    });

    expect(result.denied).toBe(true);
    expect(result.role).toBe('patient');
    expect(result.messages[0].text).toContain('authorized');
  });

  it('accepts authorized staff commands', async () => {
    const router = new TelegramUpdateRouter(new InMemoryConversationStateStore(), new StaticStaffAllowlistStore(['200']));

    const result = await router.route({
      update_id: 1,
      message: {
        message_id: 10,
        text: '/staff config',
        chat: { id: 100, type: 'private' },
        from: { id: 200 }
      }
    });

    expect(result.denied).toBe(false);
    expect(result.role).toBe('staff');
  });

  it('routes patient messages into scheduling flow', async () => {
    const router = new TelegramUpdateRouter(new InMemoryConversationStateStore(), new StaticStaffAllowlistStore([]));

    const result = await router.route({
      update_id: 1,
      message: {
        message_id: 10,
        text: '/schedule',
        chat: { id: 100, type: 'private' },
        from: { id: 200 }
      }
    });

    expect(result.role).toBe('patient');
    expect(result.messages[0].text).toContain('Choose a location');
  });
});
