import pdfParse from "pdf-parse";
import mammoth from "mammoth";

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractTextFromFile(file) {
  const ext = (file.filename || "").split(".").pop()?.toLowerCase();
  const mime = (file.mimeType || "").toLowerCase();
  const buffer = file.buffer;

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Invalid file buffer.");
  }

  const isPdf = ext === "pdf" || mime.includes("pdf");
  const isDocx =
    ext === "docx" ||
    mime.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

  if (isPdf) {
    const data = await pdfParse(buffer);
    return normalizeWhitespace(data?.text || "");
  }

  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeWhitespace(result?.value || "");
  }

  throw new Error("Unsupported file type. Upload PDF or DOCX.");
}

