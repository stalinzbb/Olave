import "server-only";

import type { Params } from "@/lib/spec";
import { env } from "@/lib/server/env";

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number | null;
  /** USD per 1M tokens */
  inputPrice: number | null;
  outputPrice: number | null;
}

export interface Completion {
  provider: "openrouter" | "mock";
  output: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  cost: number | null;
}

const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Public catalogue; no key is sent. Cached for an hour by Next's fetch cache. */
export async function listModels(): Promise<ModelInfo[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      data?: Array<{ id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }>;
    };
    const perMillion = (value?: string) => (value && Number.isFinite(Number(value)) ? Number(value) * 1_000_000 : null);
    return (payload.data ?? []).map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      contextLength: model.context_length ?? null,
      inputPrice: perMillion(model.pricing?.prompt),
      outputPrice: perMillion(model.pricing?.completion),
    }));
  } catch {
    return [];
  }
}

async function priceFor(model: string, promptTokens: number, completionTokens: number): Promise<number | null> {
  const info = (await listModels()).find((entry) => entry.id === model);
  if (!info || info.inputPrice === null || info.outputPrice === null) return null;
  return Number(((promptTokens * info.inputPrice + completionTokens * info.outputPrice) / 1_000_000).toFixed(6));
}

export async function complete(input: {
  model: string;
  system: string;
  user: string;
  params: Params;
  json?: boolean;
}): Promise<Completion> {
  const promptEstimate = estimateTokens(`${input.system}\n${input.user}`);
  const key = env.OPENROUTER_API_KEY;

  if (!key) {
    const excerpt = input.user.replace(/\s+/g, " ").trim().slice(0, 120);
    const output = `[Mock output: OPENROUTER_API_KEY is not set on the server.] ${input.model} would answer: "${excerpt}…"`;
    return { provider: "mock", output, promptTokens: promptEstimate, completionTokens: estimateTokens(output), latencyMs: 0, cost: 0 };
  }

  const startedAt = Date.now();
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(800 * 2 ** attempt + Math.random() * 400);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "LLM Evals" },
      body: JSON.stringify({
        model: input.model,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.user },
        ],
        temperature: input.params.temperature,
        top_p: input.params.top_p,
        max_tokens: input.params.max_tokens,
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    lastStatus = response.status;
    if (response.status === 429 || response.status >= 500) continue;

    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    // Upstream text is kept short and is redacted again by the caller before it is stored.
    if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${payload.error?.message ?? "request failed"}`);

    const content = payload.choices?.[0]?.message?.content;
    const output = typeof content === "string" ? content.trim() : "";
    const promptTokens = payload.usage?.prompt_tokens ?? promptEstimate;
    const completionTokens = payload.usage?.completion_tokens ?? estimateTokens(output);
    return {
      provider: "openrouter",
      output,
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - startedAt,
      cost: await priceFor(input.model, promptTokens, completionTokens),
    };
  }
  throw new Error(`OpenRouter ${lastStatus}: still failing after retries.`);
}
