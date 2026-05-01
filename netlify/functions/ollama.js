import { Ollama } from "ollama";
import { errorResponse, getJsonBody, jsonResponse, requireEnv } from "./_utils.js";

function getClient() {
  return new Ollama({
    host: process.env.OLLAMA_HOST || "https://ollama.com",
    headers: {
      Authorization: "Bearer " + requireEnv("OLLAMA_API_KEY"),
    },
  });
}

async function chatToString({ model, messages }) {
  const client = getClient();
  // Prefer non-streaming responses in Netlify Functions to avoid upstream/proxy
  // inactivity timeouts when a model pauses between streamed chunks.
  const response = await client.chat({
    model,
    messages,
    stream: false,
  });
  return response?.message?.content ?? "";
}

export async function handler(event) {
  try {
    const body = getJsonBody(event);
    const model = body?.model || "gpt-oss:120b-cloud";
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    if (!messages) return errorResponse(400, "Body must include `messages` array.");

    const text = await chatToString({ model, messages });
    return jsonResponse(200, { model, text });
  } catch (err) {
    const rawMsg = String(err?.message || "");
    const msg =
      err?.code === "MISSING_ENV"
        ? err.message
        : rawMsg.includes("Inactivity Timeout")
          ? "Ollama request timed out (inactivity). Try again, reduce resume length, or use a faster model."
          : "Ollama request failed.";
    return errorResponse(500, msg, err?.message ? String(err.message) : undefined);
  }
}

export { chatToString };
