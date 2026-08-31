/**
 * Creates a deterministic canonical JSON string from an object.
 * This guarantees the exact same string output for identical logical payloads,
 * regardless of key insertion order.
 */
export function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const arrayElements = obj.map((item) => canonicalize(item)).join(",");
    return `[${arrayElements}]`;
  }

  const sortedKeys = Object.keys(obj).sort();
  const keyValues = sortedKeys
    .map((key) => {
      const value = (obj as Record<string, unknown>)[key];
      if (value === undefined) return "";
      return `"${key}":${canonicalize(value)}`;
    })
    .filter((str) => str !== "");

  return `{${keyValues.join(",")}}`;
}

/**
 * Generates a SHA-256 hash of a deterministic canonical JSON string.
 * This function works in both Browser and Node.js environments.
 */
export async function generateRequestHash(payload: unknown): Promise<string> {
  const canonicalString = canonicalize(payload);

  // Browser and Node.js 18+ environment (crypto.subtle)
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalString);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  throw new Error("No cryptographic capability available for hashing");
}
