import type { Criterion, Engine, GraderConfig, NoulCheck } from "@/lib/spec";

// Plain module (not "use client") so server pages can read these values too.

// One dimension per criterion. An earlier default mixed "invents things" and "omits things" on one scale;
// on live data Jev split its probability between the two ends (e.g. 0.31 / 0.55), so the weighted mean
// landed on a middle level nobody believed. Omission is a spectrum (Score); invention is yes/no (Noul).
const COMPLETENESS: Criterion = {
  id: "completeness",
  name: "Completeness",
  weight: 2,
  instructions: "How much of what matters in `input` is preserved in `response`? Judge omissions only, not additions.",
  levels: [
    "Misses the main point of the input",
    "Gets the main point but omits a fact that changes what is being asked (an amount, date, or ID)",
    "Keeps the ask and the key facts but drops minor specifics",
    "Every fact that matters in the input is preserved",
  ],
};

const INVENTS: NoulCheck = {
  id: "invents",
  name: "Invents content",
  instructions:
    "Does `response` state a fact, or claim that something happened or will happen (an action, decision or outcome), that `input` does not state?",
  passWhen: "no",
  threshold: 0.5,
};

export const DEFAULT_CONFIG: Record<Engine, GraderConfig> = {
  code: { engine: "code", checks: [{ type: "max_words", max: 40 }] },
  // The judge has no yes/no gates, so its rubric carries invention as a second criterion instead.
  judge: {
    engine: "judge",
    model: "openai/gpt-4o-mini",
    temperature: 0,
    samples: 1,
    passScore: 0.7,
    criteria: [
      COMPLETENESS,
      {
        id: "grounded",
        name: "Groundedness",
        weight: 2,
        instructions: "Does `response` stay within what `input` states? Judge additions only, not omissions.",
        levels: [
          "Claims an action, decision or outcome that the input does not state",
          "Adds a specific fact (number, date, name, ID) that is not in the input",
          "Adds only a reasonable inference that is clearly implied by the input",
          "Adds nothing beyond the input",
        ],
      },
    ],
  },
  jev: { engine: "jev", passScore: 0.7, flagBelowConfidence: 0.6, criteria: [COMPLETENESS], nouls: [INVENTS] },
};
