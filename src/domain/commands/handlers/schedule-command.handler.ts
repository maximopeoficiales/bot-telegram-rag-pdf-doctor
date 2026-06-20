import { BotCommand } from '../bot-commands.js';
import type { CommandHandler } from '../command-handler.interface.js';
import type { ParsedMessage } from '../parsed-message.js';
import type { HandlerContext, HandlerResult } from '../handler-context.js';

export class ScheduleCommandHandler implements CommandHandler {
  canHandle(message: ParsedMessage): boolean {
    return message.command === BotCommand.SCHEDULE;
  }

  async handle(message: ParsedMessage, context: HandlerContext): Promise<HandlerResult> {
    const reply = await context.schedulingFlow.handleMessage(context.userId, message.text);
    await context.messaging.sendMessage(context.chatId, reply.text);
    return { handled: true };
  }
}
