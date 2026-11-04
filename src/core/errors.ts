/** Exit codes (design §8). */
export const EXIT = { internal: 1, usage: 2, shallow: 3, noRepo: 4, state: 5 } as const;

/** A failure with a user-facing message (never containing absolute paths) and an exit code. */
export class CommetError extends Error {
  constructor(message: string, readonly exitCode: number) {
    super(message);
  }
}
