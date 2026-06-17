/* Shared id generation. */

/** A short, collision-resistant id for persisted records (nooks, categories,
 *  custom types). Prefers a sliced crypto UUID; falls back to a time+random
 *  base-36 string where `crypto.randomUUID` is unavailable. */
export function genId(): string {
  const c = (window as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().slice(0, 8);
  return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}
