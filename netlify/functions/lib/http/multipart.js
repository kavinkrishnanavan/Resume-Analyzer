import Busboy from "busboy";

export function parseMultipart(req, { maxFileBytes = 6 * 1024 * 1024 } = {}) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    return Promise.reject(new Error("Content-Type must be multipart/form-data"));
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
        reject(new Error("File too large."));
      });

      stream.on("error", (e) => reject(e));
    });

    bb.on("error", (e) => reject(e));
    bb.on("finish", () => {
      if (file) file.buffer = Buffer.concat(chunks);
      resolve({ fields, file, bytes: fileBytes });
    });

    req.pipe(bb);
  });
}

