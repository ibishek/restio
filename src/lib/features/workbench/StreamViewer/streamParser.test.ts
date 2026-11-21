import { describe, expect, it } from "vitest";
import { StreamParser } from "./streamParser";

describe("StreamParser", () => {
  it("parses OpenAI-compatible SSE chunks across boundaries", () => {
    const parser = new StreamParser();

    // Chunk 1: partial event
    const r1 = parser.pushChunk({
      index: 0,
      text: 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      elapsedMs: 25,
      bytes: 52,
    });
    expect(r1.newEvents.length).toBe(0);
    expect(r1.newText).toBe("");

    // Chunk 2: finishes event 1 and starts event 2
    const r2 = parser.pushChunk({
      index: 1,
      text: '\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      elapsedMs: 50,
      bytes: 54,
    });
    expect(r2.newEvents.length).toBe(2);
    expect(r2.newText).toBe("Hello world");
    expect(r2.metrics.ttftMs).toBe(50);
    expect(parser.getAccumulatedText()).toBe("Hello world");
  });

  it("parses Anthropic Claude content_block_delta events", () => {
    const parser = new StreamParser();
    const chunk = {
      index: 0,
      text: 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude response"}}\n\n',
      elapsedMs: 120,
      bytes: 110,
    };
    const r = parser.pushChunk(chunk);
    expect(r.newEvents.length).toBe(1);
    expect(r.newEvents[0].eventType).toBe("content_block_delta");
    expect(r.newText).toBe("Claude response");
  });

  it("parses Google Gemini streaming candidate parts", () => {
    const parser = new StreamParser();
    const chunk = {
      index: 0,
      text: 'data: {"candidates":[{"content":{"parts":[{"text":"Gemini response"}]}}]}\n\n',
      elapsedMs: 80,
      bytes: 75,
    };
    const r = parser.pushChunk(chunk);
    expect(r.newEvents.length).toBe(1);
    expect(r.newText).toBe("Gemini response");
  });

  it("ignores SSE comments and handles [DONE]", () => {
    const parser = new StreamParser();
    const r1 = parser.pushChunk({
      index: 0,
      text: ": ping keepalive\n\ndata: [DONE]\n\n",
      elapsedMs: 100,
      bytes: 32,
    });
    expect(r1.newEvents.length).toBe(1);
    expect(r1.newEvents[0].data).toBe("[DONE]");
    expect(r1.newText).toBe("");
  });

  it("does not treat normal JSON REST responses as SSE streams", () => {
    const parser = new StreamParser();
    const r1 = parser.pushChunk({
      index: 0,
      text: '{"id": 123, "name": "Standard JSON API Response", "items": [1, 2, 3]}',
      elapsedMs: 40,
      bytes: 70,
    });
    expect(r1.isSse).toBe(false);
    expect(r1.newEvents.length).toBe(0);
    expect(r1.newText).toBe("");
    expect(parser.getAccumulatedText()).toBe("");
  });
});
