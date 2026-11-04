const MIN_LINE_CHARS = 8;
const NO_WORD_CHARS = /^[^\p{L}\p{N}]*$/u;

/**
 * Normalises an added line for matching: trim and collapse whitespace runs. Returns null for
 * trivial lines (under 8 characters, or only brackets and punctuation) that would match anything.
 */
export function normaliseLine(raw: string): string | null {
  const line = raw.trim().replace(/\s+/g, ' ');
  if (line.length < MIN_LINE_CHARS || NO_WORD_CHARS.test(line)) return null;
  return line;
}

/** Hashes of an added-line list's countable lines. Shared by the transcript and git sides so they can't drift. */
export function hashLines(lines: string[], hash: (line: string) => string): string[] {
  return lines.flatMap((l) => {
    const n = normaliseLine(l);
    return n === null ? [] : [hash(n)];
  });
}
