// The on-disk envelope: { magic, version, savedAt, checksum, data }, plus checksum and base64 helpers.
// Pure functions, no storage access, usable in the browser and in Node.
import { SaveError } from './errors.js';

export const MAGIC = 'phluph-save';

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE) of the UTF-8 bytes of `text`, as 8 lowercase hex digits. */
export function crc32(text) {
  let c = 0xffffffff;
  for (const b of encoder.encode(text)) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

/** The checksum stored in an envelope: algorithm-prefixed so it can change later. */
export const checksumOf = (dataJson) => `crc32:${crc32(dataJson)}`;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Serializes `data` into an envelope string. `version` defaults to data.version. */
export function encodeEnvelope(data, { version = data?.version, savedAt = Date.now(), magic = MAGIC } = {}) {
  const dataJson = JSON.stringify(data);
  // Re-parse so the envelope carries exactly what JSON can represent (NaN -> null, undefined dropped);
  // the checksum is over the same canonical text the loader will recompute.
  return JSON.stringify({ magic, version, savedAt, checksum: checksumOf(dataJson), data: JSON.parse(dataJson) });
}

/**
 * Parses and verifies an envelope string. Returns { version, savedAt, data } or throws SaveError('CORRUPT').
 * Does not check the version against SAVE_VERSION (the caller decides about NEWER_VERSION).
 */
export function decodeEnvelope(text, { magic = MAGIC } = {}) {
  let env;
  try {
    env = JSON.parse(text);
  } catch (cause) {
    throw new SaveError('CORRUPT', 'save is not valid JSON', { cause });
  }
  if (!isPlainObject(env) || env.magic !== magic) throw new SaveError('CORRUPT', 'not a Phluph save (bad magic)');
  if (!isPlainObject(env.data)) throw new SaveError('CORRUPT', 'save has no data');
  if (env.checksum !== checksumOf(JSON.stringify(env.data))) throw new SaveError('CORRUPT', 'save checksum mismatch');
  const version = Number(env.version ?? env.data.version ?? 1);
  if (!Number.isInteger(version) || version < 1) throw new SaveError('CORRUPT', `bad save version ${env.version}`);
  return { version, savedAt: Number(env.savedAt) || null, data: env.data };
}

/** Base64 of the UTF-8 bytes of `text`. */
export function toBase64(text) {
  const bytes = encoder.encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Inverse of toBase64; throws SaveError('CORRUPT') on anything that is not base64 of UTF-8 text. */
export function fromBase64(b64) {
  try {
    const bin = atob(String(b64).replace(/\s+/g, ''));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new SaveError('CORRUPT', 'import text is not a valid save code', { cause });
  }
}
