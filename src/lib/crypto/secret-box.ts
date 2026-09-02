import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Symmetric encryption for secrets held in the database.
 *
 * API tokens configured through the admin screens are stored encrypted rather
 * than in clear: the settings table is readable by anything with database
 * access, and a provider token is a credential that can spend money. The key is
 * derived from the deployment's AUTH_SECRET, so it is never itself in the
 * database, and rotating AUTH_SECRET invalidates stored secrets by design.
 *
 * AES-256-GCM: the auth tag makes tampering detectable rather than silently
 * decrypting to nonsense.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const SALT = "secplatform.settings.v1";
const PREFIX = "enc.v1:";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required to store or read encrypted settings");
  }
  return scryptSync(secret, SALT, 32);
}

/** Encrypt a value for storage. Returns a self-describing, prefixed string. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const enciphered = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, enciphered].map((b) => b.toString("base64")).join(".");
}

/**
 * Decrypt a stored value. Returns null rather than throwing when the value is
 * unreadable — a secret encrypted under a previous AUTH_SECRET should surface
 * as "not configured" and be re-entered, not crash every request that needs it.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored || !stored.startsWith(PREFIX)) return null;
  try {
    const [iv, tag, payload] = stored
      .slice(PREFIX.length)
      .split(".")
      .map((part) => Buffer.from(part, "base64"));
    if (!iv || !tag || !payload) return null;

    const decipher = createDecipheriv(ALGORITHM, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** A safe hint for the UI: enough to recognise a key, not enough to use it. */
export function maskSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const tail = plaintext.slice(-4);
  return plaintext.length <= 8 ? "••••" : `••••••••${tail}`;
}
