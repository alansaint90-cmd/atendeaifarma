import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(value = process.env.SETTINGS_ENCRYPTION_KEY): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("Encryption key unavailable");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("Encryption key unavailable");
  return key;
}

export function seal(value: unknown, key?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  cipher.setAAD(Buffer.from("atendeia:integration-settings:v1"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString("base64")).join(".");
}

export function unseal(value: string, key?: string): unknown {
  const [iv, tag, payload] = value.split(".").map(part => Buffer.from(part, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(key), iv);
  cipher.setAAD(Buffer.from("atendeia:integration-settings:v1"));
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(payload), cipher.final()]).toString("utf8"));
}
