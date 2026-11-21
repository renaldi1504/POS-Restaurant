import argon2 from 'argon2';

/** Hash PIN 4 digit dengan argon2id. */
export function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPin(hash: string | null | undefined, pin: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, pin);
  } catch {
    return false;
  }
}
