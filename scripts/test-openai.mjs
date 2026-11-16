import "dotenv/config";

const key = process.env.OPENAI_API_KEY?.trim();
const model = process.env.OPENAI_MODEL?.trim();

if (!key || !model) {
  console.error("OPENAI_API_KEY et OPENAI_MODEL sont requis.");
  process.exit(1);
}

const knownCodes = new Set([
  "invalid_api_key",
  "insufficient_quota",
  "model_not_found",
  "rate_limit_exceeded",
  "unsupported_parameter",
  "invalid_request_error",
]);

try {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: 'Return this JSON object: {"ok":true}' }],
      response_format: { type: "json_object" },
      max_completion_tokens: 128,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body?.error?.code;
    console.error(`OpenAI HTTP ${response.status} — ${knownCodes.has(code) ? code : "code non reconnu"}`);
    process.exitCode = 1;
  } else {
    const content = body?.choices?.[0]?.message?.content;
    let valid = false;
    if (typeof content === "string") {
      try { valid = JSON.parse(content)?.ok === true; } catch { /* invalid JSON */ }
    }
    console.log(`OpenAI HTTP ${response.status} — ${valid ? "réponse JSON valide" : "réponse JSON inattendue"}`);
    if (!valid) process.exitCode = 1;
  }
} catch (error) {
  console.error(error?.name === "TimeoutError" ? "Délai OpenAI dépassé." : "Connexion directe à OpenAI impossible.");
  process.exitCode = 1;
}
