import type { SseEvent, StreamChunk, StreamMetrics } from "#lib/types";

/**
 * Robust stream parser that handles Server-Sent Events (SSE) chunk accumulation,
 * delta extraction for major LLM providers (OpenAI, Anthropic, Gemini, Ollama, DeepSeek),
 * and real-time generation metrics.
 */

export interface ParsedChunkResult {
  newEvents: SseEvent[];
  newText: string;
  isSse: boolean;
  metrics: StreamMetrics;
}

export class StreamParser {
  private buffer = "";
  private eventCounter = 0;
  private startTime = 0;
  private firstTokenTime: number | null = null;
  private totalBytes = 0;
  private accumulatedText = "";
  private isSseDetected = false;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.buffer = "";
    this.eventCounter = 0;
    this.startTime = Date.now();
    this.firstTokenTime = null;
    this.totalBytes = 0;
    this.accumulatedText = "";
    this.isSseDetected = false;
  }

  /**
   * Process an incoming raw chunk from the IPC channel.
   */
  public pushChunk(chunk: StreamChunk): ParsedChunkResult {
    this.totalBytes += chunk.bytes;
    if (this.startTime === 0) {
      this.startTime = Date.now() - chunk.elapsedMs;
    }

    const chunkText = chunk.text;
    this.buffer += chunkText;

    // Detect SSE signatures: buffer begins with or contains line-start SSE markers
    if (
      !this.isSseDetected &&
      (this.buffer.startsWith("data:") ||
        this.buffer.includes("\ndata:") ||
        this.buffer.includes("\r\ndata:") ||
        this.buffer.startsWith("event:") ||
        this.buffer.includes("\nevent:") ||
        this.buffer.includes("\r\nevent:") ||
        this.buffer.startsWith(":") ||
        this.buffer.includes("\n:"))
    ) {
      this.isSseDetected = true;
    }

    const newEvents: SseEvent[] = [];
    let deltaText = "";

    if (this.isSseDetected) {
      // Split on double newlines per SSE specification (\n\n, \r\n\r\n, \r\r)
      const parts = this.buffer.split(/\r\n\r\n|\n\n|\r\r/);
      // The last part is incomplete unless the buffer ended with double newline
      this.buffer = parts.pop() ?? "";

      for (const block of parts) {
        if (!block.trim()) continue;
        const parsed = this.parseSseBlock(block, chunk.elapsedMs);
        if (parsed) {
          newEvents.push(parsed);
          const extracted = this.extractLlmDelta(parsed.data);
          if (extracted) {
            deltaText += extracted;
            if (this.firstTokenTime === null) {
              this.firstTokenTime = chunk.elapsedMs;
            }
          }
        }
      }

      this.accumulatedText += deltaText;
    }

    // Approximate token count: ~4 characters per token as standard LLM heuristic
    const approxTokens = Math.max(1, Math.round(this.accumulatedText.length / 4));
    const durationMs = chunk.elapsedMs;
    const tokensPerSec = durationMs > 0 ? approxTokens / (durationMs / 1000) : 0;

    const metrics: StreamMetrics = {
      eventCount: this.eventCounter,
      totalBytes: this.totalBytes,
      tokenCount: this.accumulatedText.length > 0 ? approxTokens : 0,
      tokensPerSec: Math.round(tokensPerSec * 10) / 10,
      durationMs,
      ttftMs: this.firstTokenTime,
    };

    return {
      newEvents,
      newText: deltaText,
      isSse: this.isSseDetected,
      metrics,
    };
  }

  /**
   * Parse a single SSE block (delimited by double newline).
   */
  private parseSseBlock(block: string, elapsedMs: number): SseEvent | null {
    const lines = block.split(/\r?\n/);
    let eventType = "message";
    let eventId: string | undefined;
    const dataLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine;
      if (line.startsWith(":")) {
        // Comment / keepalive
        continue;
      }
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trimStart();
      } else if (line.startsWith("id:")) {
        eventId = line.slice(3).trimStart();
      } else if (line.startsWith("data:")) {
        // SSE spec: strip at most one leading space after the colon
        const val = line.slice(5);
        dataLines.push(val.startsWith(" ") ? val.slice(1) : val);
      }
    }

    if (dataLines.length === 0 && eventType === "message" && !eventId) {
      return null;
    }

    this.eventCounter += 1;
    return {
      id: this.eventCounter,
      eventId,
      eventType,
      data: dataLines.join("\n"),
      raw: block,
      timestampMs: Date.now(),
      deltaMs: elapsedMs,
    };
  }

  /**
   * Extract delta text from LLM streaming formats (OpenAI, Anthropic, Gemini, Ollama, DeepSeek).
   */
  public extractLlmDelta(data: string): string {
    const trimmed = data.trim();
    if (trimmed === "[DONE]" || !trimmed) {
      return "";
    }

    try {
      const json = JSON.parse(trimmed);

      // 1. OpenAI / Groq / vLLM / DeepSeek format
      if (Array.isArray(json.choices) && json.choices.length > 0) {
        const choice = json.choices[0];
        if (choice.delta) {
          if (typeof choice.delta.content === "string") {
            return choice.delta.content;
          }
          if (typeof choice.delta.reasoning_content === "string") {
            return choice.delta.reasoning_content;
          }
        }
        if (typeof choice.text === "string") {
          return choice.text;
        }
      }

      // 2. Anthropic Claude format
      // event: content_block_delta -> {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
      if (json.type === "content_block_delta" && json.delta) {
        if (typeof json.delta.text === "string") {
          return json.delta.text;
        }
        if (typeof json.delta.thinking === "string") {
          return json.delta.thinking;
        }
      }

      // 3. Google Gemini format
      // {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
      if (Array.isArray(json.candidates) && json.candidates.length > 0) {
        const cand = json.candidates[0];
        const parts = cand?.content?.parts;
        if (Array.isArray(parts) && parts.length > 0 && typeof parts[0]?.text === "string") {
          return parts[0].text;
        }
      }

      // 4. Ollama format
      // {"message":{"content":"..."},"done":false} or {"response":"..."}
      if (json.message && typeof json.message.content === "string") {
        return json.message.content;
      }
      if (typeof json.response === "string") {
        return json.response;
      }

      return "";
    } catch {
      // If not JSON, but contains plain text in data: payload, return it directly
      return trimmed;
    }
  }

  public getAccumulatedText(): string {
    return this.accumulatedText;
  }
}
