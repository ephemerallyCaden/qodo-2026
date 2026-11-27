// Mastery (#201, understanding mode U3): a planet's cleared files over all its files, by count. It
// imports nothing, so the CLI, the view and the render stand-ins share this one rule.

/** Whole percent, rounded down, so it never says 100% while a file isn't clear (Rule 1). 0 for no files. */
export const masteryPercent = (clear: number, total: number): number => (total <= 0 ? 0 : Math.floor((clear * 100) / total));
