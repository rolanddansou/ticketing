import "dotenv/config";

const key = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim().replace(/^models\//, "");

if (!key || !model) {
  console.error("GEMINI_API_KEY et GEMINI_MODEL sont requis.");
  process.exit(1);
}

const knownCodes = new Set([
  "UNAUTHENTICATED", "PERMISSION_DENIED", "INVALID_ARGUMENT", "NOT_FOUND",
  "RESOURCE_EXHAUSTED", "API_KEY_INVALID", "invalid_api_key", "model_not_found",
  "insufficient_quota", "rate_limit_exceeded", "invalid_request_error",
]);

try {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: 'Return this JSON object: {"ok":true}' }],
      response_format: { type: "json_object" },
      max_tokens: 128,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const errors = Array.isArray(body) ? body : [body];
    const codes = errors.flatMap(item => {
      const error = item?.error;
      const details = Array.isArray(error?.details) ? error.details : [];
      return [error?.status, error?.code, error?.type, ...details.map(detail => detail?.reason)];
    });
    const code = codes.find(value => knownCodes.has(value));
    console.error(`Gemini HTTP ${response.status} — ${code ?? "code non reconnu"}`);
    process.exitCode = 1;
  } else {
    const content = body?.choices?.[0]?.message?.content;
    let valid = false;
    if (typeof content === "string") {
      try { valid = JSON.parse(content)?.ok === true; } catch { /* invalid JSON */ }
    }
    console.log(`Gemini HTTP ${response.status} — ${valid ? "réponse JSON valide" : "réponse JSON inattendue"}`);
    if (!valid) process.exitCode = 1;
  }
} catch (error) {
  console.error(error?.name === "TimeoutError" ? "Délai Gemini dépassé." : "Connexion directe à Gemini impossible.");
  process.exitCode = 1;
}
