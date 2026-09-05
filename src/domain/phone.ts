/**
 * Phone numbers, written the way people read them.
 *
 * North American numbers only, because that is the whole league. Anything that is not ten digits —
 * or eleven starting with a one — is handed back untouched rather than mangled into a shape it does
 * not have, so somebody abroad can still type their own number and see it as they wrote it.
 */

const digitsOf = (value: string): string => value.replace(/\D/g, '');

/** (425) 471-4580 */
export function formatPhone(value: string): string {
  const digits = digitsOf(value);
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return value.trim();
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/**
 * The same shape, applied while somebody is still typing.
 *
 * Partial input has to stay partial: closing the bracket after three digits is right, but adding
 * the dash before there is anything after it just moves the cursor somewhere surprising.
 */
export function typingPhone(value: string): string {
  const digits = digitsOf(value).slice(0, 11);
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length <= 3) return national;
  if (national.length <= 6) return `(${national.slice(0, 3)}) ${national.slice(3)}`;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 10)}`;
}

/** What a tel: or sms: link needs: digits, and a country code if they gave one. */
export const dialable = (value: string): string => {
  const digits = digitsOf(value);
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
};
