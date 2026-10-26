import { createHash } from "node:crypto";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const allowed = new Map([["application/pdf", ".pdf"], ["image/png", ".png"], ["image/jpeg", ".jpg"], ["text/plain", ".txt"]]);
export function validateDocument(file: File) {
  if (!file || file.size < 1 || file.size > MAX_FILE_BYTES) throw new Error("Document must be between 1 byte and 10 MB.");
  const extension = allowed.get(file.type);
  if (!extension) throw new Error("Allowed document types: PDF, PNG, JPEG, and plain text.");
  const name = file.name.replace(/[\\/\\:*?\"<>|\u0000-\u001f]/g, "_").slice(0, 140);
  if (!name.toLowerCase().endsWith(extension)) throw new Error("Filename extension must match the declared document type.");
  return { name, mimeType: file.type };
}
export function verifyFileHash(bytes: Buffer, expected: string) {
  const actual = createHash("sha256").update(bytes).digest("hex");
  return { actual, matches: actual.toLowerCase() === expected.replace(/^0x/, "").toLowerCase() };
}
export function validateFileBytes(bytes: Buffer, mimeType: string) {
  if (mimeType === "application/pdf" && bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("File contents do not match PDF format.");
  if (mimeType === "image/png" && bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("File contents do not match PNG format.");
  if (mimeType === "image/jpeg" && !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new Error("File contents do not match JPEG format.");
  if (mimeType === "text/plain") {
    if (bytes.includes(0)) throw new Error("Text files cannot contain null bytes.");
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("Text files must use valid UTF-8 encoding."); }
  }
}
