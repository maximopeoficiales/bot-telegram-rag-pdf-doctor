import type { LocationId } from '../../application/scheduling/scheduling-flow.js';
import type { AiInterpretationPort, EmbeddingPort, ExtractedSchedule, GenerationPort } from '../../ports/ai.port.js';
import { isValidScheduleEntry } from '../../lib/schedule-validation.js';

export type OllamaAdapterConfig = {
  baseUrl?: string;
  generationModel?: string;
  embeddingModel?: string;
  timeoutMs?: number;
  clinicTimezone?: string;
  fetch?: typeof fetch;
};

type GenerateResponse = {
  response?: string;
};

type EmbedResponse = {
  embedding?: number[];
  embeddings?: number[][];
};

const DEFAULT_BASE_URL = 'http://host.docker.internal:11434';
const DEFAULT_GENERATION_MODEL = 'qwen2.5:7b';
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';
const DEFAULT_TIMEOUT_MS = 30_000;
const EMBEDDING_DIMENSIONS = 768;

export class OllamaAdapter implements EmbeddingPort, GenerationPort, AiInterpretationPort {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly generationModel: string;
  private readonly embeddingModel: string;
  private readonly timeoutMs: number;
  private readonly clinicTimezone: string;

  constructor(config: OllamaAdapterConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.generationModel = config.generationModel ?? DEFAULT_GENERATION_MODEL;
    this.embeddingModel = config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.clinicTimezone = config.clinicTimezone ?? 'America/Lima';
    this.fetchFn = config.fetch ?? fetch;
  }

  // ── EmbeddingPort ──────────────────────────────────────────────────────────

  async embedChunks(chunks: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const chunk of chunks) {
      embeddings.push(await this.embedText(chunk));
    }

    return embeddings;
  }

  async embedQuery(query: string): Promise<number[]> {
    return this.embedText(query);
  }

  // ── GenerationPort ─────────────────────────────────────────────────────────

  async answer(input: { question: string; context: string[] }): Promise<string> {
    const contextBlock = input.context
      .map((chunk, i) => `[${i + 1}] ${chunk}`)
      .join('\n\n');

    const prompt = [
      'Eres el asistente virtual de un consultorio de quiropraxia en Perú.',
      'Responde la pregunta del paciente basándote ÚNICAMENTE en la información del contexto.',
      'Si el contexto no contiene la respuesta, dilo claramente.',
      'Responde en español formal peruano, de forma concisa y amable. Máximo 3 oraciones.',
      '',
      `Contexto:\n${contextBlock}`,
      '',
      `Pregunta: ${input.question}`
    ].join('\n');

    try {
      return await this.generate(prompt);
    } catch {
      return 'No puedo responder en este momento. Por favor intenta en unos minutos.';
    }
  }

  async extractRules(input: { title: string; content: string }): Promise<unknown[]> {
    try {
      const prompt = [
        'Extrae las reglas de elegibilidad del siguiente documento médico.',
        'Devuelve un array JSON con objetos que tengan: { condition, outcome, notes }.',
        'Solo devuelve el JSON, sin explicaciones.',
        '',
        `Título: ${input.title}`,
        `Contenido: ${input.content}`
      ].join('\n');

      const raw = await this.generate(prompt);
      const parsed = parseJsonFromModelOutput(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // ── Schedule extraction ────────────────────────────────────────────────────

  async extractSchedule(content: string): Promise<ExtractedSchedule | null> {
    try {
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
      const parsed = parseJsonFromModelOutput(raw);
      if (parsed === null) return null;
      if (!isRecord(parsed)) return null;

      const schedule: ExtractedSchedule = {};
      if (isValidScheduleEntry(parsed.surco)) schedule.surco = parsed.surco;
      if (isValidScheduleEntry(parsed.vmt)) schedule.vmt = parsed.vmt;

      return schedule.surco || schedule.vmt ? schedule : null;
    } catch {
      return null;
    }
  }

  // ── Intent interpretation ──────────────────────────────────────────────────

  async interpretConfirmation(text: string): Promise<boolean> {
    try {
      const prompt = [
        'El usuario debe confirmar o rechazar una cita médica.',
        `El usuario escribió: "${text}"`,
        '¿Esto es una CONFIRMACIÓN de la cita?',
        'Responde solo con: SI o NO'
      ].join('\n');

      const raw = await this.generate(prompt);
      return normalizePlainText(raw).startsWith('si');
    } catch {
      return false;
    }
  }

  async interpretDate(text: string): Promise<string | null> {
    try {
      // Use Lima timezone (America/Lima, UTC-5) — the clinic and patients are in Peru
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: this.clinicTimezone }).format(new Date());

      const prompt = [
        `Hoy es ${today} (timezone: ${this.clinicTimezone}).`,
        `El usuario escribió: "${text}"`,
        'Interpreta esto como una fecha de cita médica relativa a hoy.',
        'Devuelve la fecha en formato YYYY-MM-DD.',
        'Si no puedes interpretar una fecha válida, devuelve: null',
        'Solo devuelve la fecha o null, sin explicaciones.'
      ].join('\n');

      const raw = await this.generate(prompt);
      const dateMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
      return dateMatch?.[0] ?? null;
    } catch {
      return null;
    }
  }

  async interpretSlot(text: string, availableSlots: string[]): Promise<string | null> {
    try {
      // Build 12h display so the model understands both formats
      const slots12h = availableSlots.map((s) => {
        const [h, m] = s.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:${String(m).padStart(2, '0')} ${period}`;
      });
      const slotsDisplay = availableSlots.map((s, i) => `${s} (${slots12h[i]})`).join(', ');

      const prompt = [
        `Los horarios disponibles son: ${slotsDisplay}`,
        `El usuario escribió: "${text}"`,
        'El usuario puede usar formato 12h (7pm, 7 de la noche, 6 y media) o 24h (19:00, 19).',
        'Si escribe solo un número como "7", intérpretalo como hora (AM o PM según el contexto de los horarios disponibles).',
        'Identifica a cuál de los horarios disponibles se refiere el usuario.',
        `Devuelve el horario exacto en formato HH:MM de esta lista: ${availableSlots.join(', ')}`,
        'Si no coincide con ninguno, devuelve: null',
        'Solo devuelve el horario en formato HH:MM o null, sin explicaciones.'
      ].join('\n');

      const raw = await this.generate(prompt);
      const slotMatch = raw.match(/\b\d{2}:\d{2}\b/);
      const selected = slotMatch?.[0] ?? raw.trim();
      return availableSlots.includes(selected) ? selected : null;
    } catch {
      return null;
    }
  }

  async interpretLocation(text: string): Promise<LocationId | null> {
    try {
      const prompt = [
        'Las sedes del consultorio son: Surco y VMT (Villa María del Triunfo).',
        `El usuario escribió: "${text}"`,
        '¿A cuál sede se refiere?',
        'Devuelve exactamente: surco o vmt',
        'Si no se refiere a ninguna, devuelve: null',
        'Solo devuelve la respuesta, sin explicaciones.'
      ].join('\n');

      const cleaned = normalizePlainText(await this.generate(prompt));
      if (/\bsurco\b/.test(cleaned)) return 'surco';
      if (/\bvmt\b|villa maria|villa maria del triunfo/.test(cleaned)) return 'vmt';
      return null;
    } catch {
      return null;
    }
  }

  async interpretAge(text: string): Promise<number | null> {
    try {
      const prompt = [
        `El paciente indicó su edad de esta forma: "${text}"`,
        'Extrae el número de años. Solo devuelve el número entero, sin texto adicional.',
        'Si no puedes determinar una edad válida, devuelve: null'
      ].join('\n');

      const raw = normalizePlainText(await this.generate(prompt));
      const match = raw.match(/\d+/);
      if (!match) return null;
      const age = Number(match[0]);
      return Number.isInteger(age) && age > 0 && age < 120 ? age : null;
    } catch {
      return null;
    }
  }

  async interpretDni(text: string): Promise<string | null> {
    try {
      const prompt = [
        `El paciente indicó su DNI de esta forma: "${text}"`,
        'Extrae el número de DNI (8 dígitos numéricos). Solo devuelve los 8 dígitos, sin texto adicional.',
        'Si no puedes determinar un DNI válido de 8 dígitos, devuelve: null'
      ].join('\n');

      const raw = await this.generate(prompt);
      const match = raw.replace(/\s/g, '').match(/\d{8}/);
      return match ? match[0] : null;
    } catch {
      return null;
    }
  }

  async interpretDistrict(text: string): Promise<string | null> {
    try {
      const prompt = [
        `El paciente indicó su distrito de esta forma: "${text}"`,
        'Extrae el nombre del distrito de Lima o ciudad peruana. Devuelve solo el nombre del distrito, sin texto adicional.',
        'Si no puedes determinar un distrito válido, devuelve: null'
      ].join('\n');

      const raw = await this.generate(prompt);
      const cleaned = raw.trim();
      return cleaned && cleaned.toLowerCase() !== 'null' ? cleaned : null;
    } catch {
      return null;
    }
  }

  async interpretGait(text: string): Promise<'normal' | 'imbalance' | null> {
    try {
      const prompt = [
        `El paciente describió su forma de caminar así: "${text}"`,
        '¿Camina con normalidad o tiene dificultad para caminar?',
        'Devuelve exactamente: normal o imbalance',
        'Si no puedes determinarlo, devuelve: null'
      ].join('\n');

      const raw = normalizePlainText(await this.generate(prompt));
      if (raw.startsWith('normal')) return 'normal';
      if (raw.startsWith('imbalance') || raw.includes('dificultad')) return 'imbalance';
      return null;
    } catch {
      return null;
    }
  }

  async interpretAssistiveDevice(text: string): Promise<string | null> {
    try {
      const prompt = [
        `El paciente indicó su dispositivo de apoyo así: "${text}"`,
        'Extrae si usa algún dispositivo (bastón, andador, muletas, silla de ruedas) o ninguno.',
        'Devuelve el nombre del dispositivo en español, o "ninguno" si no usa nada.',
        'Si no puedes determinarlo, devuelve: null'
      ].join('\n');

      const raw = await this.generate(prompt);
      const cleaned = raw.trim().toLowerCase();
      return cleaned && cleaned !== 'null' ? cleaned : null;
    } catch {
      return null;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async generate(prompt: string): Promise<string> {
    const response = await this.post<GenerateResponse>('/api/generate', {
      model: this.generationModel,
      prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 1024 }
    });

    return response.response?.trim() ?? '';
  }

  private async embedText(text: string): Promise<number[]> {
    try {
      const response = await this.post<EmbedResponse>('/api/embed', {
        model: this.embeddingModel,
        input: text
      });

      return normalizeEmbedding(response);
    } catch (error) {
      const response = await this.post<EmbedResponse>('/api/embeddings', {
        model: this.embeddingModel,
        prompt: text
      });

      return normalizeEmbedding(response, error);
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;

    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Ollama API timeout after ${this.timeoutMs}ms while calling ${path}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Consume the body to prevent resource leaks but do NOT include its content
      // in the thrown error — the response body may contain patient or document data.
      await response.text().catch(() => undefined);
      throw new Error(`Ollama API error ${response.status} ${response.statusText} on ${path}`);
    }

    return (await response.json()) as T;
  }
}

function normalizeEmbedding(response: EmbedResponse, cause?: unknown): number[] {
  const embedding = response.embedding ?? response.embeddings?.[0];

  if (!Array.isArray(embedding)) {
    throw new Error(`Ollama embedding response did not include an embedding${cause ? ` after fallback: ${String(cause)}` : ''}`);
  }

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Ollama embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`);
  }

  return embedding;
}

function parseJsonFromModelOutput(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  if (cleaned === '' || cleaned.toLowerCase() === 'null') return null;

  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch) return null;

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function normalizePlainText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9:\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
