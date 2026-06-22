import { BotCommand } from '../bot-commands.js';
import type { CommandHandler } from '../command-handler.interface.js';
import type { ParsedMessage } from '../parsed-message.js';
import type { HandlerContext, HandlerResult } from '../handler-context.js';
import type { KnowledgeIngestionService } from '../../../application/knowledge/knowledge-ingestion.js';
import type { AiInterpretationPort } from '../../../ports/ai.port.js';
import type { ScheduleRepository } from '../../../application/scheduling/schedule.repository.js';
import type { LocationId } from '../../../application/scheduling/scheduling-flow.js';
import { isValidScheduleEntry } from '../../../lib/schedule-validation.js';

const FLOW = 'upload_document';
const STEP_WAITING_TITLE = 'upload_document.waiting_title';
const STEP_WAITING_CONTENT = 'upload_document.waiting_content';
const STEP_WAITING_SCHEDULE_CONFIRM = 'upload_document.waiting_schedule_confirm';

export type UploadDocumentAiInterpreter = Pick<AiInterpretationPort, 'extractSchedule' | 'interpretConfirmation'>;

export class UploadDocumentHandler implements CommandHandler {
  constructor(
    private readonly ingestion: KnowledgeIngestionService,
    private readonly aiInterpreter: UploadDocumentAiInterpreter,
    private readonly scheduleRepo: ScheduleRepository
  ) {}

  canHandle(message: ParsedMessage): boolean {
    return message.command === BotCommand.UPLOAD_DOCUMENT;
  }

  async handle(message: ParsedMessage, context: HandlerContext): Promise<HandlerResult> {
    const state = await context.conversations.get(context.userId);
    const step = state?.step ?? 'idle';
    const data = (state?.data ?? {}) as Record<string, unknown>;

    // Follow-up: waiting for schedule confirmation
    if (step === STEP_WAITING_SCHEDULE_CONFIRM) {
      return this.handleScheduleConfirmation(message, context, data);
    }

    // Follow-up: waiting for document content
    if (step === STEP_WAITING_CONTENT) {
      return this.processDocument(context, data['title'] as string ?? 'Documento', message.text.trim());
    }

    // Follow-up: waiting for title
    if (step === STEP_WAITING_TITLE) {
      return this.handleTitle(message, context);
    }

    // Initial /upload_document — check for inline content
    const inlineContent = message.text.replace(BotCommand.UPLOAD_DOCUMENT, '').trim();
    if (inlineContent.length > 0) {
      return this.processDocument(context, 'Documento', inlineContent);
    }

    // Ask for title
    await context.conversations.save({
      telegramUserId: context.userId,
      flow: FLOW,
      step: STEP_WAITING_TITLE,
      data: {}
    });

    await context.messaging.sendMessage(
      context.chatId,
      '¿Cuál es el título del documento? (Usa el mismo título para reemplazar uno existente)'
    );

    return { handled: true };
  }

  private async handleTitle(message: ParsedMessage, context: HandlerContext): Promise<HandlerResult> {
    const title = message.text.trim();

    if (!title) {
      await context.messaging.sendMessage(context.chatId, 'Por favor envía un título válido.');
      return { handled: true };
    }

    await context.conversations.save({
      telegramUserId: context.userId,
      flow: FLOW,
      step: STEP_WAITING_CONTENT,
      data: { title }
    });

    await context.messaging.sendMessage(
      context.chatId,
      `Título: "${title}". Ahora envía el contenido del documento como texto.`
    );

    return { handled: true };
  }

  private async processDocument(
    context: HandlerContext,
    title: string,
    content: string
  ): Promise<HandlerResult> {
    if (!content) {
      await context.messaging.sendMessage(context.chatId, 'Por favor envía el contenido del documento.');
      return { handled: true };
    }

    const extractedSchedule = await this.aiInterpreter.extractSchedule(content);

    if (extractedSchedule && Object.keys(extractedSchedule).length > 0) {
      const lines: string[] = [];
      if (extractedSchedule.surco) lines.push(`• Surco: ${extractedSchedule.surco.start} a ${extractedSchedule.surco.end}`);
      if (extractedSchedule.vmt)   lines.push(`• VMT: ${extractedSchedule.vmt.start} a ${extractedSchedule.vmt.end}`);

      await context.conversations.save({
        telegramUserId: context.userId,
        flow: FLOW,
        step: STEP_WAITING_SCHEDULE_CONFIRM,
        data: { title, content, extractedSchedule }
      });

      await context.messaging.sendMessage(
        context.chatId,
        `Detecté estos horarios en el documento:\n${lines.join('\n')}\n\n¿Son correctos? Responde sí para confirmar o no para ignorar el cambio de horarios.`
      );

      return { handled: true };
    }

    return this.ingestAndRespond(context, title, content);
  }

  private async handleScheduleConfirmation(
    message: ParsedMessage,
    context: HandlerContext,
    data: Record<string, unknown>
  ): Promise<HandlerResult> {
    const title = (data['title'] as string | undefined) ?? 'Documento';
    const content = (data['content'] as string | undefined) ?? '';
    const extractedSchedule = data['extractedSchedule'] as Record<string, { start: string; end: string }> | undefined;

    const isConfirmed = await this.aiInterpreter.interpretConfirmation(message.text);

    if (isConfirmed && extractedSchedule) {
      for (const [locationId, window] of Object.entries(extractedSchedule)) {
        // Re-validate each window from the stored conversation state before
        // persisting — the AI adapter already validated on extraction, but
        // the state round-trip through JSON deserialisation and the handler
        // boundary check here act as the final defence against malformed data.
        if (!isValidScheduleEntry(window)) continue;

        await this.scheduleRepo.upsert({
          locationId: locationId as LocationId,
          label: locationId === 'surco' ? 'Surco' : 'VMT',
          start: window.start,
          end: window.end,
          timeZone: 'America/Lima',
          durationMinutes: 30
        });
      }
    }

    return this.ingestAndRespond(context, title, content, isConfirmed && !!extractedSchedule);
  }

  private async ingestAndRespond(
    context: HandlerContext,
    title: string,
    content: string,
    scheduleUpdated = false
  ): Promise<HandlerResult> {
    await context.conversations.save({
      telegramUserId: context.userId,
      flow: 'none',
      step: 'idle',
      data: {}
    });

    const result = await this.ingestion.ingestStaffDocument({
      telegramUserId: context.userId,
      title,
      sourceType: 'staff_text',
      content
    });

    if (!result.accepted) {
      const reason = result.reason === 'unauthorized'
        ? 'No tienes permisos para subir documentos.'
        : 'El contenido del documento está vacío.';
      await context.messaging.sendMessage(context.chatId, reason);
      return { handled: true };
    }

    const lines = [`✅ Documento "${title}" procesado. ${result.chunkCount} fragmentos indexados.`];
    if (scheduleUpdated) lines.push('📅 Horarios actualizados en el sistema.');

    await context.messaging.sendMessage(context.chatId, lines.join('\n'));
    return { handled: true };
  }
}
