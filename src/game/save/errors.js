// Typed errors for the save system. Callers branch on `code`, never on the message text.

/**
 * Error codes:
 * - CORRUPT        data unreadable (bad JSON, wrong magic, checksum mismatch) and no backup recovered
 * - NEWER_VERSION  the save was written by a newer build (version > SAVE_VERSION); refused, never guessed at
 * - MISSING        nothing stored where something was required (e.g. exporting an empty slot)
 * - QUOTA          storage is full (localStorage QuotaExceededError)
 * - STORAGE        any other storage failure (access denied, write could not be verified)
 * - BAD_SLOT       slot id is not 1, 2, 3 or 'auto'
 * - NO_STATE       a save was requested without a state to save
 */
export const SAVE_ERROR_CODES = Object.freeze(['CORRUPT', 'NEWER_VERSION', 'MISSING', 'QUOTA', 'STORAGE', 'BAD_SLOT', 'NO_STATE']);

export class SaveError extends Error {
  /**
   * @param {string} code one of SAVE_ERROR_CODES
   * @param {string} [message]
   * @param {{ cause?: unknown, slot?: number|string, version?: number }} [details]
   */
  constructor(code, message = code, details = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = 'SaveError';
    this.code = code;
    if (details.slot !== undefined) this.slot = details.slot;
    if (details.version !== undefined) this.version = details.version;
  }
}

export const isSaveError = (e, code) => e instanceof SaveError && (code === undefined || e.code === code);
