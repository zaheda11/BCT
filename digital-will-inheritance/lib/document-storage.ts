import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export function documentKey() {
  const value = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) throw new Error("DOCUMENT_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters.");
  return Buffer.from(value, "hex");
}
export function encryptDocument(plain: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", documentKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { ciphertext, nonce: nonce.toString("hex"), authTag: cipher.getAuthTag().toString("hex") };
}
export function decryptDocument(ciphertext: Buffer, nonce: string, authTag: string) {
  const decipher = createDecipheriv("aes-256-gcm", documentKey(), Buffer.from(nonce, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
