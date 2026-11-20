// Server-only: calls a language model. Never import this in client code.
//
// Any provider that speaks the common "chat completions" format works: Groq, Google Gemini, OpenRouter, a local
// Ollama and most others. Anthropic's own API is supported too. Pick one with settings, no code change:
//
//   GROQ_API_KEY=...                      (or GEMINI_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY)
//   AI_PROVIDER=groq                      optional; otherwise the first provider that has a key is used
//   AI_MODEL=model-a,model-b              optional; tried in order, so a rate-limited model falls through to the next
//   AI_BASE_URL + AI_API_KEY              for any other provider (set AI_PROVIDER=custom)
//
// Every failure is survivable: the caller gets null and shows its own plain prepared answer instead.

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type Kind = "openai" | "anthropic";

export interface Provider {
  name: string;
  kind: Kind;
  /** The full endpoint a request is posted to. */
  url: string;
  key: string;
  /** Tried in this order. Free tiers limit each model separately, so more than one stretches the daily budget. */
  models: string[];
}

interface Preset {
  kind: Kind;
  url: string;
  keyVar: string;
  models: string[];
}

const PRESETS: Record<string, Preset> = {
  groq: {
    kind: "openai",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyVar: "GROQ_API_KEY",
    // Names change as Groq retires and adds models. A name that no longer exists is skipped, and AI_MODEL overrides these.
    models: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
  },
  gemini: {
    kind: "openai",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyVar: "GEMINI_API_KEY",
    models: ["gemini-2.5-flash"],
  },
  openrouter: {
    kind: "openai",
    url: "https://openrouter.ai/api/v1/chat/completions",
    keyVar: "OPENROUTER_API_KEY",
    models: ["meta-llama/llama-3.3-70b-instruct:free"],
  },
  anthropic: {
    kind: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    keyVar: "ANTHROPIC_API_KEY",
    models: ["claude-haiku-5-5"],
  },
};

type Env = Record<string, string | undefined>;

const list = (value: string | undefined): string[] => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Which provider this server is set up to use, or null when there is none. */
export function resolveProvider(env: Env = process.env): Provider | null {
  const wanted = (env.AI_PROVIDER ?? "").trim().toLowerCase();
  const overrideModels = list(env.AI_MODEL);

  if (wanted === "custom" || (!wanted && !Object.values(PRESETS).some((p) => env[p.keyVar]) && env.AI_BASE_URL)) {
    const base = (env.AI_BASE_URL ?? "").trim().replace(/\/+$/, "");
    const key = env.AI_API_KEY?.trim();
    // Hosted providers must be https. Plain http is only allowed for a model running on this same machine.
    const local = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(base);
    if (!base || (!base.startsWith("https://") && !local) || !overrideModels.length) return null;
    // A local model needs no key; a hosted one does.
    if (!key && !local) return null;
    return { name: "custom", kind: "openai", url: `${base}/chat/completions`, key: key ?? "", models: overrideModels };
  }

  const name = wanted || Object.keys(PRESETS).find((n) => env[PRESETS[n]!.keyVar]?.trim());
  const preset = name ? PRESETS[name] : undefined;
  if (!name || !preset) return null;
  const key = (env.AI_API_KEY?.trim() || env[preset.keyVar]?.trim()) ?? "";
  if (!key) return null;
  const models = overrideModels.length ? overrideModels : name === "anthropic" && env.ANTHROPIC_MODEL ? [env.ANTHROPIC_MODEL] : preset.models;
  return { name, kind: preset.kind, url: preset.url, key, models };
}

/** True when this server can reach a language model. Without one every AI route answers with basic prepared text. */
export function aiConfigured(): boolean {
  return resolveProvider() !== null;
}

let warnedNoKey = false;

const TIMEOUT_MS = () => Math.max(2_000, Number(process.env.AI_TIMEOUT_MS) || 20_000);

/** Why a call failed, short enough to log and never containing the key. */
async function reasonOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { type?: string; code?: string; message?: string } | string };
    const e = body.error;
    const text = typeof e === "string" ? e : `${e?.type ?? e?.code ?? ""} ${e?.message ?? ""}`;
    return text.trim().slice(0, 200) || "no details";
  } catch {
    return "no details";
  }
}

/** Models that think before they answer. The thinking counts against the token limit, so they need room for it. */
const REASONING = /gpt-oss|qwen3|deepseek-r1|(^|[/-])o[134](-|$)|reasoning/i;
const THINKING_ROOM = 1500;

/** Some models write their thinking inside <think> tags. It is not part of the answer. */
const withoutThinking = (text: string) => text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

async function once(p: Provider, model: string, opts: { system: string; messages: ChatMessage[]; maxTokens: number }): Promise<{ text?: string; stop?: boolean }> {
  const anthropic = p.kind === "anthropic";
  const res = await fetch(p.url, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS()),
    headers: anthropic
      ? { "content-type": "application/json", "x-api-key": p.key, "anthropic-version": "2023-06-01" }
      : { "content-type": "application/json", ...(p.key ? { authorization: `Bearer ${p.key}` } : {}) },
    body: JSON.stringify(
      anthropic
        ? { model, max_tokens: opts.maxTokens, system: opts.system, messages: opts.messages }
        : {
            model,
            max_tokens: opts.maxTokens + (REASONING.test(model) ? THINKING_ROOM : 0),
            temperature: 0.4,
            // gpt-oss on Groq accepts how hard to think. Low keeps answers quick and leaves tokens for the answer.
            ...(p.name === "groq" && /gpt-oss/i.test(model) ? { reasoning_effort: "low" } : {}),
            messages: [{ role: "system", content: opts.system }, ...opts.messages],
          },
    ),
  });
  if (!res.ok) {
    console.error(`[ai] ${p.name} answered HTTP ${res.status} for model "${model}": ${await reasonOf(res)}`);
    // A wrong or revoked key will not get better with another model, so stop. Anything else (rate limit, unknown
    // model, provider trouble) is worth trying the next model for.
    return { stop: res.status === 401 || res.status === 403 };
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; choices?: { message?: { content?: unknown }; finish_reason?: string }[] };
  const raw = anthropic ? data.content?.map((c) => c.text ?? "").join("") : data.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? withoutThinking(raw) : "";
  if (!text) console.error(`[ai] ${p.name} gave no answer text for model "${model}" (finish: ${data.choices?.[0]?.finish_reason ?? "unknown"})`);
  return text ? { text } : {};
}

/** Ask the configured model. Returns the text, or null when nothing is configured or every attempt failed. */
export async function callModel(opts: { system: string; messages: ChatMessage[]; maxTokens?: number }): Promise<string | null> {
  const provider = resolveProvider();
  if (!provider) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn("[ai] No AI key is set, so AI features return basic prepared answers. Set GROQ_API_KEY (or another provider's key) in apps/web/.env.local and restart.");
    }
    return null;
  }
  const maxTokens = opts.maxTokens ?? 500;
  for (const model of provider.models) {
    try {
      const result = await once(provider, model, { system: opts.system, messages: opts.messages, maxTokens });
      if (result.text) return result.text;
      if (result.stop) return null;
    } catch (error) {
      console.error(`[ai] could not reach ${provider.name} (${model}):`, error instanceof Error ? error.name : "error");
    }
  }
  return null;
}
