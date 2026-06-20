export interface MessagingPort {
  sendMessage(recipient: string, text: string): Promise<void>;
  sendFile?(recipient: string, fileUrl: string, caption?: string): Promise<void>;
}
