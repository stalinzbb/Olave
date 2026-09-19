import "server-only";

import type { Grade, GraderConfig } from "@/lib/spec";
import { gradeWithCode } from "@/lib/server/graders/code";
import { gradeWithJev } from "@/lib/server/graders/jev";
import { gradeWithJudge } from "@/lib/server/graders/judge";

export interface GradableCell {
  model: string;
  userPrompt: string;
  output: string;
  vars: Record<string, string>;
}

export async function grade(config: GraderConfig, cell: GradableCell): Promise<Grade> {
  switch (config.engine) {
    case "code":
      return gradeWithCode(config.checks, cell.output, cell.vars);
    case "judge":
      return gradeWithJudge(config, cell);
    case "jev":
      return gradeWithJev(config, cell);
  }
}
