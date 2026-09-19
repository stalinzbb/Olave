import type { Criterion, Engine, GraderConfig } from "@/lib/spec";

// Plain module (not "use client") so server pages can read these values too.
const FAITHFULNESS: Criterion = {
  id: "faithfulness",
  name: "Faithfulness",
  weight: 2,
  instructions: "How faithfully does `response` represent the facts in `input`?",
  levels: [
    "States facts that contradict the input or invents facts not in it",
    "Omits a fact that changes what is being asked (an amount, date, or ID)",
    "Keeps the ask but drops minor specifics",
    "Every fact that matters is kept and nothing is invented",
  ],
};

export const DEFAULT_CONFIG: Record<Engine, GraderConfig> = {
  code: { engine: "code", checks: [{ type: "max_words", max: 40 }] },
  judge: { engine: "judge", model: "openai/gpt-4o", temperature: 0, samples: 1, passScore: 0.7, criteria: [FAITHFULNESS] },
  jev: {
    engine: "jev",
    passScore: 0.7,
    flagBelowConfidence: 0.6,
    criteria: [FAITHFULNESS],
    nouls: [{ id: "invented", name: "Invents facts", instructions: "Does `response` state a specific fact (a number, date, name or ID) that does not appear in `input`?", passWhen: "no", threshold: 0.5 }],
  },
};
