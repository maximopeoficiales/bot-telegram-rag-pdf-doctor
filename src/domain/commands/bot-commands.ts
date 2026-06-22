export enum BotCommand {
  START = '/start',
  SCHEDULE = '/schedule',
  REPLY = '/reply',
  STAFF = '/staff',
  CONFIG = '/config',
  UPLOAD_DOCUMENT = '/upload_document',
}

export enum MessageType {
  COMMAND = 'command',
  FILE = 'file',
  TEXT = 'text',
}
