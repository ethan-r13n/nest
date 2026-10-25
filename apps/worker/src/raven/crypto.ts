const VERSION = 'v1';
const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function importEncryptionKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-GCM with the purpose as associated data, so a sealed value only opens where it was written. */
export async function seal(key: CryptoKey, purpose: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(purpose) },
    key,
    encoder.encode(plaintext),
  );
  return `${VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

export async function unseal(key: CryptoKey, purpose: string, value: string): Promise<string> {
  const [version, iv, body] = value.split('.');
  if (version !== VERSION || !iv || !body) throw new Error('Unrecognized sealed value.');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv), additionalData: encoder.encode(purpose) },
    key,
    fromBase64(body),
  );
  return decoder.decode(plaintext);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
