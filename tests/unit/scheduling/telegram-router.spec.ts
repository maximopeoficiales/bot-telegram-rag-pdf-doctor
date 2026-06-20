import { describe, expect, it } from 'vitest';
import { InMemoryConversationStateStore } from '../../../src/domain/conversation/conversation-state.js';
import { AuthorizationGuard } from '../../../src/domain/commands/handlers/authorization-guard.handler.js';
import { StaffCommandHandler } from '../../../src/domain/commands/handlers/staff-command.handler.js';
import { ScheduleCommandHandler } from '../../../src/domain/commands/handlers/schedule-command.handler.js';
import { TextMessageHandler } from '../../../src/domain/commands/handlers/text-message.handler.js';
import { MessageRouter, StaticStaffAllowlistStore } from '../../../src/delivery/message-router/message-router.js';
import { SchedulingFlow } from '../../../src/application/scheduling/scheduling-flow.js';
import type { MessagingPort } from '../../../src/ports/messaging.port.js';

function buildRouter(authorizedIds: string[] = []) {
  const conversations = new InMemoryConversationStateStore();
  const sentMessages: string[] = [];

  const messaging: MessagingPort = {
    async sendMessage(_recipient: string, text: string) {
      sentMessages.push(text);
    }
  };

  const router = new MessageRouter(
    new StaticStaffAllowlistStore(authorizedIds),
    conversations,
    new SchedulingFlow(conversations),
    messaging
  )
    .registerHandler(new AuthorizationGuard())
    .registerHandler(new StaffCommandHandler())
    .registerHandler(new ScheduleCommandHandler())
    .registerHandler(new TextMessageHandler());

  return { router, sentMessages };
}

function makeUpdate(text: string, fromId = 200) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      text,
      chat: { id: fromId, type: 'private' },
      from: { id: fromId }
    }
  };
}

describe('MessageRouter', () => {
  it('denies unauthorized staff commands', async () => {
    const { router, sentMessages } = buildRouter([]);

    const result = await router.route(makeUpdate('/staff config', 200));

    expect(result.denied).toBe(true);
    expect(result.role).toBe('patient');
    expect(sentMessages[0]).toContain('authorized');
  });

  it('accepts authorized staff commands', async () => {
    const { router } = buildRouter(['200']);

    const result = await router.route(makeUpdate('/staff config', 200));

    expect(result.denied).toBe(false);
    expect(result.role).toBe('staff');
  });

  it('routes patient messages into scheduling flow', async () => {
    const { router, sentMessages } = buildRouter([]);

    const result = await router.route(makeUpdate('/schedule', 200));

    expect(result.role).toBe('patient');
    expect(sentMessages[0]).toContain('Choose a location');
  });
});
