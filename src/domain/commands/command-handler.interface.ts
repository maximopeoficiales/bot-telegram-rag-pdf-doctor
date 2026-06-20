import type { ParsedMessage } from './parsed-message.js';
import type { HandlerContext, HandlerResult } from './handler-context.js';

export interface CommandHandler {
  canHandle(message: ParsedMessage): boolean;
  handle(message: ParsedMessage, context: HandlerContext): Promise<HandlerResult>;
}
