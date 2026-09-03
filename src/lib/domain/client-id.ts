/**
 * Creates IDs in browsers that do not yet support crypto.randomUUID(), such as
 * older iOS Safari versions and some HTTP local-network contexts.
 */
export function createClientId(prefix: string) {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return `${prefix}-${webCrypto.randomUUID()}`;

  const bytes = new Uint8Array(12);
  if (typeof webCrypto?.getRandomValues === "function") webCrypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);

  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${Date.now().toString(36)}-${suffix}`;
}
