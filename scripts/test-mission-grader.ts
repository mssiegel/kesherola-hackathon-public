// Offline check: the mission grader must (a) return objectiveResults/outcome/
// followUpQuestion, and (b) NEVER fail a student — even a weak "I don't know"
// transcript should come back as a "supported" success. Run:
//   node --import tsx --env-file-if-exists=.env scripts/test-mission-grader.ts

import { assessTranscript } from "../assessor.ts";
import { getAssignment } from "../assignment.ts";

const assignment = getAssignment(); // seeded Golda mission

const STRONG = `
Agent: Shalom. This is Golda Meir. I am told you have urgent information. My advisors believe war is unlikely. Tell me — why do you think Egypt and Syria may attack?
User: Prime Minister, Egyptian troops are massing right by the Suez Canal, and Syrian forces are concentrating near the Golan Heights at the same time. That is not a coincidence.
Agent: Troops can be on exercises. Why does this mean war?
User: Because both fronts are moving together, and tomorrow is Yom Kippur — the one day our reserves are home and the country is fasting. That is exactly when a surprise attack would hurt us most. Even if intelligence says it is unlikely, the cost of being wrong is catastrophic. Please mobilize the reserves, or at least call an emergency meeting tonight.
Agent: You are asking me to act against my own intelligence assessment.
User: I am asking you to not bet the country on an assumption. Waiting costs us nothing we can't recover; being unprepared costs us everything.
`;

const WEAK = `
Agent: Shalom. This is Golda Meir. I am told you have urgent information. Why do you think Egypt and Syria may attack?
User: Um... I don't know. I think something bad will happen.
Agent: Tell me one warning sign. Is it connected to Egypt, Syria, or Yom Kippur?
User: I guess... Egypt?
Agent: Good. Egyptian troops are near the Suez Canal. Now, in your own words, why could waiting be dangerous?
User: Because if we wait too long maybe we won't be ready in time.
Agent: That's right. So what should I do?
User: Maybe... have a meeting?
`;

async function run(label: string, transcript: string) {
  const a = await assessTranscript(process.env.ANTHROPIC_API_KEY!, assignment, "Maya", transcript);
  console.log(`\n===== ${label} =====`);
  console.log("outcome:", a.outcome);
  console.log("score:", a.score);
  console.log("suggestedGrade:", a.suggestedGrade);
  console.log("followUpQuestion:", a.followUpQuestion);
  console.log("objectiveResults:");
  for (const r of a.objectiveResults ?? []) console.log(`  [${r.met ? "x" : " "}] ${r.objective}`);
  console.log("summary:", a.summary);

  const failed =
    !a.outcome ||
    !["strong", "medium", "supported"].includes(a.outcome) ||
    !a.objectiveResults?.length ||
    !a.followUpQuestion;
  if (failed) {
    console.error(`!! ${label}: missing mission fields`);
    process.exitCode = 1;
  }
}

await run("STRONG student", STRONG);
await run("WEAK / 'I don't know' student", WEAK);
console.log("\nDone.");
