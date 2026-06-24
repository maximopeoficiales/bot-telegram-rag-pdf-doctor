export type EmbeddingPort = {
  embedChunks(chunks: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
};

export type GenerationPort = {
  answer(input: { question: string; context: string[] }): Promise<string>;
  extractRules(input: { title: string; content: string }): Promise<unknown[]>;
};

export type ExtractedSchedule = {
  surco?: { start: string; end: string };
  vmt?: { start: string; end: string };
};

export type AiInterpretationPort = {
  interpretConfirmation(text: string): Promise<boolean>;
  interpretDate(text: string): Promise<string | null>;
  interpretSlot(text: string, availableSlots: string[]): Promise<string | null>;
  interpretLocation(text: string): Promise<'surco' | 'vmt' | null>;
  interpretAge(text: string): Promise<number | null>;
  interpretDni(text: string): Promise<string | null>;
  interpretDistrict(text: string): Promise<string | null>;
  interpretGait(text: string): Promise<'normal' | 'imbalance' | null>;
  interpretAssistiveDevice(text: string): Promise<string | null>;
  extractSchedule(content: string): Promise<ExtractedSchedule | null>;
};
