import { Ollama } from "ollama";

export async function handler(event) {
  try {
    const { prompt, model, host } = JSON.parse(event.body || "{}");
    if (!prompt || typeof prompt !== "string") {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing prompt" }) };
    }

    const resolvedHost = (host || process.env.OLLAMA_HOST || "http://127.0.0.1:11434").trim();
    const isCloud = (() => {
      try {
        const url = new URL(resolvedHost);
        return url.protocol === "https:" && url.hostname === "ollama.com";
      } catch {
        return false;
      }
    })();

    const resolvedModel =
      (model || process.env.OLLAMA_MODEL || (isCloud ? "gpt-oss:120b-cloud" : "")).trim();

    if (!resolvedModel) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Missing model. Provide { model } in the request body or set OLLAMA_MODEL (e.g. 'llama3.1' for local, or 'gpt-oss:120b-cloud' for ollama.com).",
        }),
      };
    }

    if (isCloud && !process.env.OLLAMA_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "OLLAMA_API_KEY is required when using https://ollama.com.",
        }),
      };
    }

    const ollama = new Ollama({
      host: resolvedHost,
      headers: process.env.OLLAMA_API_KEY
        ? { Authorization: "Bearer " + process.env.OLLAMA_API_KEY }
        : undefined,
    });

    const response = await ollama.chat({
      model: resolvedModel,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    let fullText = "";
    for await (const part of response) {
      fullText += part.message.content;
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache"
      },
      body: fullText
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message || String(err) })
    };
  }
}
