import Busboy from "busboy";
import { badRequest } from "./errors.js";

export function parseMultipart(req, { maxFileBytes = 6 * 1024 * 1024 } = {}) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    return Promise.reject(badRequest("Content-Type must be multipart/form-data"));
  }

  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: maxFileBytes, files: 1, fields: 20 }
    });

    const fields = {};
    let file = null;
    let fileBytes = 0;
    const chunks = [];

    bb.on("field", (name, value) => {
      fields[name] = value;
    });

    bb.on("file", (_name, stream, info) => {
      const { filename, mimeType } = info;
      file = { filename, mimeType, buffer: null };

      stream.on("data", (d) => {
        fileBytes += d.length;
        chunks.push(d);
      });

      stream.on("limit", () => {
        reject(badRequest("File too large."));
      });

      stream.on("error", (e) => reject(e));
    });

    bb.on("error", (e) => reject(e));
    bb.on("finish", () => {
      if (file) file.buffer = Buffer.concat(chunks);
      resolve({ fields, file, bytes: fileBytes });
    });

    // serverless-http may not always provide a readable stream.
    try {
      if (typeof req.pipe === "function" && req.readable !== false) {
        req.pipe(bb);
        return;
      }
    } catch {
      // fall through
    }

    const fallback = req.body || req.rawBody;
    if (!fallback) {
      reject(badRequest("Missing multipart body."));
      return;
    }

    const buf = Buffer.isBuffer(fallback)
      ? fallback
      : Buffer.from(String(fallback), "utf8");
    bb.end(buf);
  });
}
