import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callModel, resolveProvider } from "./model";

const KEYS = ["AI_PROVIDER", "AI_MODEL", "AI_BASE_URL", "AI_API_KEY", "AI_TIMEOUT_MS", "GROQ_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"];
beforeEach(() => {
  for (const k of KEYS) vi.stubEnv(k, "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const fail = (status: number, message = "nope") => new Response(JSON.stringify({ error: { message } }), { status });
const ask = () => callModel({ system: "be brief", messages: [{ role: "user", content: "hi" }], maxTokens: 50 });
const calls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => ({ url: c[0] as string, init: c[1] as RequestInit, body: JSON.parse(String((c[1] as RequestInit).body)) }));

describe("resolveProvider", () => {
  it("is null when nothing is set up", () => {
    expect(resolveProvider({})).toBeNull();
  });

  it("uses Groq when it is the key that is set, with a chain of models", () => {
    const p = resolveProvider({ GROQ_API_KEY: "k" });
    expect(p).toMatchObject({ name: "groq", kind: "openai", url: "https://api.groq.com/openai/v1/chat/completions", key: "k" });
    expect(p!.models.length).toBeGreaterThan(1);
    expect(p!.models).toContain("openai/gpt-oss-120b");
  });

  it("takes the first provider that has a key", () => {
    expect(resolveProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" })?.name).toBe("gemini");
  });

  it("lets AI_PROVIDER choose, and needs that provider's key", () => {
    expect(resolveProvider({ AI_PROVIDER: "anthropic", GROQ_API_KEY: "k" })).toBeNull();
    expect(resolveProvider({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a" })).toMatchObject({ name: "anthropic", kind: "anthropic" });
    expect(resolveProvider({ AI_PROVIDER: "groq", AI_API_KEY: "shared" })).toMatchObject({ name: "groq", key: "shared" });
  });

  it("reads an ordered, trimmed model list from AI_MODEL", () => {
    expect(resolveProvider({ GROQ_API_KEY: "k", AI_MODEL: " a/b , c ,," })?.models).toEqual(["a/b", "c"]);
  });

  it("keeps ANTHROPIC_MODEL working for Anthropic", () => {
    expect(resolveProvider({ ANTHROPIC_API_KEY: "a", ANTHROPIC_MODEL: "claude-x" })?.models).toEqual(["claude-x"]);
  });

  it("builds a custom endpoint, and insists on https unless the model is on this machine", () => {
    expect(resolveProvider({ AI_BASE_URL: "https://api.example.com/v1/", AI_API_KEY: "k", AI_MODEL: "m" })).toMatchObject({ name: "custom", url: "https://api.example.com/v1/chat/completions" });
    expect(resolveProvider({ AI_BASE_URL: "http://api.example.com/v1", AI_API_KEY: "k", AI_MODEL: "m" })).toBeNull();
    expect(resolveProvider({ AI_BASE_URL: "https://api.example.com/v1", AI_MODEL: "m" })).toBeNull(); // hosted needs a key
    expect(resolveProvider({ AI_BASE_URL: "https://api.example.com/v1", AI_API_KEY: "k" })).toBeNull(); // and a model name
    expect(resolveProvider({ AI_BASE_URL: "http://localhost:11434/v1", AI_MODEL: "llama3" })).toMatchObject({ name: "custom", key: "" });
  });
});

describe("callModel", () => {
  it("returns null, without calling anything, when no key is set", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await ask()).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("sends a Groq request in the chat format and returns the text", async () => {
    vi.stubEnv("GROQ_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "plain-model");
    const f = vi.fn().mockResolvedValue(ok("hello"));
    vi.stubGlobal("fetch", f);
    expect(await ask()).toBe("hello");
    const [c] = calls(f);
    expect(c!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((c!.init.headers as Record<string, string>).authorization).toBe("Bearer secret-key");
    expect(c!.body.messages).toEqual([{ role: "system", content: "be brief" }, { role: "user", content: "hi" }]);
    expect(c!.body.max_tokens).toBe(50);
  });

  it("gives thinking models room to think and asks gpt-oss to keep it short", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    vi.stubEnv("AI_MODEL", "openai/gpt-oss-120b,plain-model");
    const f = vi.fn().mockResolvedValue(ok("x"));
    vi.stubGlobal("fetch", f);
    await ask();
    expect(calls(f)[0]!.body).toMatchObject({ model: "openai/gpt-oss-120b", reasoning_effort: "low" });
    expect(calls(f)[0]!.body.max_tokens).toBeGreaterThan(50);
    // a plain model gets exactly what was asked for, and no reasoning setting
    vi.stubEnv("AI_MODEL", "plain-model");
    const g = vi.fn().mockResolvedValue(ok("x"));
    vi.stubGlobal("fetch", g);
    await ask();
    expect(calls(g)[0]!.body.max_tokens).toBe(50);
    expect(calls(g)[0]!.body.reasoning_effort).toBeUndefined();
  });

  it("drops <think> blocks from the answer", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    const nl = String.fromCharCode(10);
    const reply = ["<think>let me work this out", "over lines</think>", "The answer."].join(nl);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(reply)));
    expect(await ask()).toBe("The answer.");
  });

  it("treats an answer that was cut off before any text as a failure and tries the next model", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    vi.stubEnv("AI_MODEL", "thinker,backup");
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }] }), { status: 200 })).mockResolvedValueOnce(ok("backup answer"));
    vi.stubGlobal("fetch", f);
    expect(await ask()).toBe("backup answer");
    expect(String((console.error as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toContain("finish: length");
  });

  it("moves to the next model when one is rate limited", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    vi.stubEnv("AI_MODEL", "first,second");
    const f = vi.fn().mockResolvedValueOnce(fail(429, "rate limit")).mockResolvedValueOnce(ok("from second"));
    vi.stubGlobal("fetch", f);
    expect(await ask()).toBe("from second");
    expect(calls(f).map((c) => c.body.model)).toEqual(["first", "second"]);
  });

  it("moves on after a network error or an empty answer too", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    vi.stubEnv("AI_MODEL", "a,b,c");
    const f = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(ok("   ")).mockResolvedValueOnce(ok("third time"));
    vi.stubGlobal("fetch", f);
    expect(await ask()).toBe("third time");
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("stops at once on a rejected key instead of trying every model", async () => {
    vi.stubEnv("GROQ_API_KEY", "bad");
    vi.stubEnv("AI_MODEL", "a,b,c");
    const f = vi.fn().mockResolvedValue(fail(401, "invalid api key"));
    vi.stubGlobal("fetch", f);
    expect(await ask()).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("returns null when every model fails", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    vi.stubEnv("AI_MODEL", "a,b");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fail(503)));
    expect(await ask()).toBeNull();
  });

  it("never writes the key to the log", async () => {
    vi.stubEnv("GROQ_API_KEY", "super-secret-value");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fail(500, "boom")));
    await ask();
    const logged = JSON.stringify([...(console.error as ReturnType<typeof vi.fn>).mock.calls, ...(console.warn as ReturnType<typeof vi.fn>).mock.calls]);
    expect(logged).not.toContain("super-secret-value");
  });

  it("speaks Anthropic's format when that is the provider", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: "hi " }, { type: "text", text: "there" }] }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await ask()).toBe("hi there");
    const [c] = calls(f);
    expect(c!.url).toBe("https://api.anthropic.com/v1/messages");
    expect((c!.init.headers as Record<string, string>)["x-api-key"]).toBe("a-key");
    expect(c!.body.system).toBe("be brief");
  });
});
