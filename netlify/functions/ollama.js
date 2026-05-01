import { Ollama } from "ollama";
import { errorResponse, getJsonBody, jsonResponse, requireEnv } from "./_utils.js";

function getClient() {
  return new Ollama({
    host: "https://ollama.com",
    headers: {
      Authorization: "Bearer " + requireEnv("OLLAMA_API_KEY"),
    },
  });
}

async function chatToString({ model, messages }) {
  const client = getClient();
  const response = await client.chat({
    model,
    messages,
    stream: true,
  });
  let text = "";
  for await (const part of response) {
    text += part?.message?.content ?? "";
  }
  return text;
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
    const msg = err?.code === "MISSING_ENV" ? err.message : "Ollama request failed.";
    return errorResponse(500, msg, err?.message ? String(err.message) : undefined);
  }
}

export { chatToString };

