import type { EmbeddingPort, GenerationPort } from '../../ports/ai.port.js';
import type { LocationId } from '../../application/scheduling/scheduling-flow.js';

export type GeminiAdapterConfig = {
  apiKey: string;
  generationModel?: string;
  embeddingModel?: string;
  fetch?: typeof fetch;
};

type EmbedResponse = {
  embeddings: Array<{ values: number[] }>;
};

type GenerateResponse = {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
};

export type ExtractedSchedule = {
  surco?: { start: string; end: string };
  vmt?: { start: string; end: string };
};

const DEFAULT_GENERATION_MODEL = 'gemini-1.5-flash';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 768;

export class GeminiAdapter implements EmbeddingPort, GenerationPort {
  private readonly fetchFn: typeof fetch;
  private readonly apiKey: string;
  private readonly generationModel: string;
  private readonly embeddingModel: string;

  constructor(config: GeminiAdapterConfig) {
    this.apiKey = config.apiKey;
    this.generationModel = config.generationModel ?? DEFAULT_GENERATION_MODEL;
    this.embeddingModel = config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    this.fetchFn = config.fetch ?? fetch;
  }

  // ── EmbeddingPort ──────────────────────────────────────────────────────────

  async embedChunks(chunks: string[]): Promise<number[][]> {
    const requests = chunks.map((content) => ({ content: { parts: [{ text: content }] } }));

    const response = await this.post<EmbedResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.embeddingModel}:batchEmbedContents`,
      {
        requests: requests.map((r) => ({
          model: `models/${this.embeddingModel}`,
          content: r.content,
          outputDimensionality: EMBEDDING_DIMENSIONS
        }))
      }
    );

    return response.embeddings.map((e) => e.values);
  }

  async embedQuery(query: string): Promise<number[]> {
    const response = await this.post<{ embedding: { values: number[] } }>(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.embeddingModel}:embedContent`,
      {
        model: `models/${this.embeddingModel}`,
        content: { parts: [{ text: query }] },
        outputDimensionality: EMBEDDING_DIMENSIONS
      }
    );

    return response.embedding.values;
  }

  // ── GenerationPort ─────────────────────────────────────────────────────────

  async answer(input: { question: string; context: string[] }): Promise<string> {
    const contextBlock = input.context
      .map((chunk, i) => `[${i + 1}] ${chunk}`)
      .join('\n\n');

    const prompt = [
      'Eres el asistente virtual de un consultorio de quiropraxia.',
      'Responde la pregunta del paciente basándote ÚNICAMENTE en la información del contexto.',
      'Si el contexto no contiene la respuesta, dilo claramente.',
      'Responde en español, de forma clara y amable.',
      '',
      `Contexto:\n${contextBlock}`,
      '',
      `Pregunta: ${input.question}`
    ].join('\n');

    return this.generate(prompt);
  }

  async extractRules(input: { title: string; content: string }): Promise<unknown[]> {
    const prompt = [
      'Extrae las reglas de elegibilidad del siguiente documento médico.',
      'Devuelve un array JSON con objetos que tengan: { condition, outcome, notes }.',
      'Solo devuelve el JSON, sin explicaciones.',
      '',
      `Título: ${input.title}`,
      `Contenido: ${input.content}`
    ].join('\n');

    const raw = await this.generate(prompt);

    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned) as unknown[];
    } catch {
      return [];
    }
  }

  // ── Schedule extraction ────────────────────────────────────────────────────

  async extractSchedule(content: string): Promise<ExtractedSchedule | null> {
    const prompt = [
      'Analiza el siguiente texto e identifica si contiene información de horarios de atención.',
      'Las sedes son: Surco y VMT (Villa María del Triunfo).',
      'Si encuentras horarios, devuelve un JSON con este formato exacto:',
      '{ "surco": { "start": "HH:MM", "end": "HH:MM" }, "vmt": { "start": "HH:MM", "end": "HH:MM" } }',
      'Incluye solo las sedes que tengan horario explícito en el texto.',
      'Si NO hay horarios en el texto, devuelve exactamente: null',
      'Solo devuelve el JSON o null, sin explicaciones.',
      '',
      `Texto:\n${content}`
    ].join('\n');

    const raw = await this.generate(prompt);
    const cleaned = raw.replace(/```json|```/g, '').trim();

    if (cleaned === 'null' || cleaned === '') return null;

    try {
      return JSON.parse(cleaned) as ExtractedSchedule;
    } catch {
      return null;
    }
  }

  // ── Intent interpretation ──────────────────────────────────────────────────

  async interpretConfirmation(text: string): Promise<boolean> {
    const prompt = [
      'El usuario debe confirmar o rechazar una cita médica.',
      `El usuario escribió: "${text}"`,
      '¿Esto es una CONFIRMACIÓN de la cita?',
      'Responde solo con: SI o NO'
    ].join('\n');

    const raw = await this.generate(prompt);
    return raw.trim().toUpperCase().startsWith('SI');
  }

  async interpretDate(text: string): Promise<string | null> {
    const today = new Date().toISOString().split('T')[0];

    const prompt = [
      `Hoy es ${today}.`,
      `El usuario escribió: "${text}"`,
      'Interpreta esto como una fecha de cita médica.',
      'Devuelve la fecha en formato YYYY-MM-DD.',
      'Si no puedes interpretar una fecha válida, devuelve: null',
      'Solo devuelve la fecha o null, sin explicaciones.'
    ].join('\n');

    const raw = await this.generate(prompt);
    const cleaned = raw.trim();

    if (cleaned === 'null') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
    return null;
  }

  async interpretSlot(text: string, availableSlots: string[]): Promise<string | null> {
    const prompt = [
      `Los horarios disponibles son: ${availableSlots.join(', ')}`,
      `El usuario escribió: "${text}"`,
      'Identifica a cuál de los horarios disponibles se refiere el usuario.',
      `Devuelve el horario exacto (formato HH:MM) de la lista: ${availableSlots.join(', ')}`,
      'Si no coincide con ninguno, devuelve: null',
      'Solo devuelve el horario o null, sin explicaciones.'
    ].join('\n');

    const raw = await this.generate(prompt);
    const cleaned = raw.trim();

    if (availableSlots.includes(cleaned)) return cleaned;
    return null;
  }

  async interpretLocation(text: string): Promise<LocationId | null> {
    const prompt = [
      'Las sedes del consultorio son: Surco y VMT (Villa María del Triunfo).',
      `El usuario escribió: "${text}"`,
      '¿A cuál sede se refiere?',
      'Devuelve exactamente: surco o vmt',
      'Si no se refiere a ninguna, devuelve: null',
      'Solo devuelve la respuesta, sin explicaciones.'
    ].join('\n');

    const raw = await this.generate(prompt);
    const cleaned = raw.trim().toLowerCase();

    if (cleaned === 'surco') return 'surco';
    if (cleaned === 'vmt') return 'vmt';
    return null;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async generate(prompt: string): Promise<string> {
    const response = await this.post<GenerateResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.generationModel}:generateContent`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
      }
    );

    return response.candidates[0]?.content?.parts[0]?.text?.trim() ?? '';
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    const response = await this.fetchFn(`${url}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${error}`);
    }

    return (await response.json()) as T;
  }
}
