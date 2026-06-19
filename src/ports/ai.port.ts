export type EmbeddingPort = {
  embedChunks(chunks: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
};

export type GenerationPort = {
  answer(input: { question: string; context: string[] }): Promise<string>;
  extractRules(input: { title: string; content: string }): Promise<unknown[]>;
};
