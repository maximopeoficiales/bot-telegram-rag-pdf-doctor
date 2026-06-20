export enum BotCommand {
  START = '/start',
  SCHEDULE = '/schedule',
  REPLY = '/reply',
  STAFF = '/staff',
  CONFIG = '/config',
  UPLOAD_KNOWLEDGE = '/upload_knowledge',
}

export enum MessageType {
  COMMAND = 'command',
  FILE = 'file',
  TEXT = 'text',
}
