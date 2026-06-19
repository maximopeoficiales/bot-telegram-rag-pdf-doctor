export type PatientMessengerPort = {
  sendMessage(chatId: string, text: string): Promise<void>;
};

export type ReplyThreadRepository = {
  findByCaseId(caseId: number): Promise<{ patientTelegramUserId: string } | null>;
};

export class StaffReplyService {
  constructor(
    private readonly replyThreads: ReplyThreadRepository,
    private readonly patientMessenger: PatientMessengerPort
  ) {}

  async sendMediatedReply(input: { caseId: number; message: string }): Promise<boolean> {
    const thread = await this.replyThreads.findByCaseId(input.caseId);
    if (!thread) return false;

    await this.patientMessenger.sendMessage(thread.patientTelegramUserId, `The team replied: ${input.message}`);
    return true;
  }
}
