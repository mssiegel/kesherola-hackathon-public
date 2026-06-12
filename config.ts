// Configuration — secrets are sourced ONLY from the environment (.env).
// .env is loaded by Node itself via the `--env-file-if-exists=.env` start flag.

export interface Settings {
  apiKey: string;
  baseUrl: string;
  numberId?: string; // explicit default sending number id, optional
  openaiApiKey?: string; // preferred key for transcript assessment
  anthropicApiKey?: string; // optional fallback key for transcript assessment
  assessmentModel: string;
}

export function loadSettings(): Settings {
  const apiKey = (process.env.DIAL_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error(
      "DIAL_API_KEY is not set. Put it in .env:\n    DIAL_API_KEY=sk_live_...",
    );
  }
  const baseUrl = (process.env.DIAL_BASE_URL ?? "https://getdial.ai").trim();
  const numberId = (process.env.DIAL_NUMBER_ID ?? "").trim() || undefined;
  const openaiApiKey =
    (process.env.OPENAI_API_KEY ?? "").trim() ||
    (process.env.CODEX_API_KEY ?? "").trim() ||
    undefined;
  const anthropicApiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim() || undefined;
  const assessmentModel =
    (process.env.ASSESS_MODEL ?? "").trim() ||
    (anthropicApiKey && !openaiApiKey ? "claude-sonnet-4-6" : "gpt-5.5");
  return { apiKey, baseUrl, numberId, openaiApiKey, anthropicApiKey, assessmentModel };
}
