import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { errorResponse, getJsonBody, jsonResponse } from "./_utils.js";

function filenameFor(format) {
  const base = "optimized_resume";
  if (format === "txt") return `${base}.txt`;
  if (format === "docx") return `${base}.docx`;
  if (format === "pdf") return `${base}.pdf`;
  return `${base}.${format}`;
}

function wrapText(text, width) {
  const words = String(text).replace(/\r\n/g, "\n").split(/(\s+)/);
  const lines = [];
  let line = "";
  for (const token of words) {
    if (token === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    if ((line + token).length > width && line.trim().length > 0) {
      lines.push(line.trimEnd());
      line = token.trimStart();
    } else {
      line += token;
    }
  }
  if (line.length) lines.push(line.trimEnd());
  return lines;
}

async function toDocxBase64(text) {
  const paragraphs = String(text)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => new Paragraph({ children: [new TextRun({ text: line })] }));

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs.length ? paragraphs : [new Paragraph("")] }],
  });

  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf).toString("base64");
}

async function toPdfBase64(text) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fontSize = 11;
  const margin = 48;
  const lineHeight = fontSize * 1.35;

  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();

  const maxChars = Math.max(20, Math.floor((width - margin * 2) / (fontSize * 0.52)));
  const lines = wrapText(text, maxChars);

  let y = height - margin;
  let currentPage = page;
  for (const line of lines) {
    if (y - lineHeight < margin) {
      currentPage = pdfDoc.addPage();
      y = height - margin;
    }
    currentPage.drawText(line, { x: margin, y, size: fontSize, font });
    y -= lineHeight;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes).toString("base64");
}

export async function handler(event) {
  try {
    const body = getJsonBody(event);
    const format = String(body?.format || "").toLowerCase();
    const text = String(body?.text || "");

    if (!format || !["txt", "docx", "pdf"].includes(format)) return errorResponse(400, "Invalid `format`. Use txt|docx|pdf.");
    if (!text.trim()) return errorResponse(400, "Empty `text`.");

    if (format === "txt") {
      const base64 = Buffer.from(text, "utf8").toString("base64");
      return jsonResponse(200, {
        format,
        filename: filenameFor(format),
        content_type: "text/plain; charset=utf-8",
        base64,
      });
    }

    if (format === "docx") {
      const base64 = await toDocxBase64(text);
      return jsonResponse(200, {
        format,
        filename: filenameFor(format),
        content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        base64,
      });
    }

    if (format === "pdf") {
      const base64 = await toPdfBase64(text);
      return jsonResponse(200, {
        format,
        filename: filenameFor(format),
        content_type: "application/pdf",
        base64,
      });
    }

    return errorResponse(400, "Unsupported format.");
  } catch (err) {
    return errorResponse(500, "Export failed.", err?.message ? String(err.message) : undefined);
  }
}

