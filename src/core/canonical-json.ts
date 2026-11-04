/** Orders strings by Unicode codepoint (plain `<` compares UTF-16 code units). */
export function byCodepoint(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) return fixSurrogate(x) - fixSurrogate(y);
  }
  return a.length - b.length;
}

// Surrogates (D800–DFFF) encode codepoints above FFFF, so they must sort after E000–FFFF.
function fixSurrogate(c: number): number {
  if (c >= 0xd800 && c <= 0xdfff) return c + 0x2000;
  return c >= 0xe000 ? c - 0x800 : c;
}

/**
 * Byte-stable JSON: keys sorted by codepoint, undefined members dropped, two-space indent,
 * trailing newline. Throws on non-integer numbers so floats can never enter a snapshot.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, '$', '') + '\n';
}

function encode(v: unknown, at: string, indent: string): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new Error(`canonicalJson: non-integer number at ${at}`);
    return String(v);
  }
  if (typeof v !== 'object') throw new Error(`canonicalJson: unsupported ${typeof v} at ${at}`);
  const inner = indent + '  ';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const items = v.map((x, i) => inner + encode(x, `${at}[${i}]`, inner));
    return `[\n${items.join(',\n')}\n${indent}]`;
  }
  const rec = v as Record<string, unknown>;
  const keys = Object.keys(rec).filter((k) => rec[k] !== undefined).sort(byCodepoint);
  if (keys.length === 0) return '{}';
  const members = keys.map((k) => `${inner}${JSON.stringify(k)}: ${encode(rec[k], `${at}.${k}`, inner)}`);
  return `{\n${members.join(',\n')}\n${indent}}`;
}
