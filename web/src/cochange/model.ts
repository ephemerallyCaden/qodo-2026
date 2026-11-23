// Co-change in the view (#211, R9): where each file the co-change view names is drawn (a planet's
// surface, one of its test moons, the star, or not drawn), what a focused planet or file is linked to,
// and the missing-pair flags. Pure: no three.js, no DOM.
import { COCHANGE, strengthStep, type CoChangeView } from '../../../src/core/contract/cochange.js';
import type { SystemModel } from '../model/system.js';

/** The body a file is drawn on: a planet's index, or -1 for the star; `moon` its moon's index when it is a test moon. */
export interface Spot { body: number; moon: number | null }

export interface CoFile {
  fileId: string;
  path: string;
  /** null: its planet isn't in this layout (never guessed, Rule 1). */
  spot: Spot | null;
  /** A test moon's `testOf` (layout), else null. */
  testOf: string | null;
}

export interface Partner { file: CoFile; strengthMilli: number }

/** A missing-pair flag: `file` usually changes with `with`. `test`: `file` is the test moon of `with`, so the planet's flag says "tests usually change with this". */
export interface CoFlag { file: CoFile; with: CoFile; strengthMilli: number; test: boolean }

export interface CoIndex {
  files: ReadonlyMap<string, CoFile>;
  /** Each file's partners, strongest first (then by id). */
  partners: ReadonlyMap<string, readonly Partner[]>;
  /** The flags whose file is drawn, by file id. */
  flags: readonly CoFlag[];
  /** Flags whose file isn't drawn in this layout, plus the server's dismissed ones aren't here: counted for the text (Rule 1). */
  unplacedFlags: number;
}

/** The most partner bodies a focused planet draws lines to (the lab's planetPartners). */
export const PLANET_LINES = 4;

const byStrength = (a: Partner, b: Partner) => b.strengthMilli - a.strengthMilli || (a.file.fileId < b.file.fileId ? -1 : a.file.fileId > b.file.fileId ? 1 : 0);

/** The view's co-change files placed on this layout's bodies. The view must be of the layout's scan. */
export function coChangeIndex(view: CoChangeView, model: SystemModel): CoIndex {
  const drawn = new Map<string, { spot: Spot; testOf: string | null }>();
  model.planets.forEach((p, i) => {
    for (const s of p.surface.settlements) drawn.set(s.fileId, { spot: { body: i, moon: null }, testOf: null });
    p.moons.forEach((m, k) => drawn.set(m.fileId, { spot: { body: i, moon: k }, testOf: m.testOf }));
  });
  for (const m of model.star.moonlets) drawn.set(m.fileId, { spot: { body: -1, moon: null }, testOf: null });
  const planetAt = new Map(model.planets.map((p, i) => [p.dirId, i]));
  const files = new Map<string, CoFile>();
  for (const f of view.files) {
    const d = drawn.get(f.fileId);
    // Not drawn (surface or moon overflow): on its home planet, as the fog counts it.
    const home = f.home === 'star' ? -1 : planetAt.get(f.home);
    const spot = d?.spot ?? (home === undefined ? null : { body: home, moon: null });
    files.set(f.fileId, { fileId: f.fileId, path: f.path, spot, testOf: d?.testOf ?? null });
  }
  const partners = new Map<string, Partner[]>();
  const add = (from: string, to: string, strengthMilli: number) => {
    const file = files.get(to)!;
    const list = partners.get(from);
    if (list) list.push({ file, strengthMilli });
    else partners.set(from, [{ file, strengthMilli }]);
  };
  for (const l of view.links) { add(l.a, l.b, l.strengthMilli); add(l.b, l.a, l.strengthMilli); }
  for (const list of partners.values()) list.sort(byStrength);
  const flags: CoFlag[] = [];
  let unplacedFlags = 0;
  for (const f of view.flags) {
    const file = files.get(f.fileId)!, other = files.get(f.with)!;
    if (!file.spot) { unplacedFlags++; continue; }
    flags.push({ file, with: other, strengthMilli: f.strengthMilli, test: file.spot.moon !== null && file.testOf === other.fileId });
  }
  return { files, partners, flags, unplacedFlags };
}

/** A body the focus is linked to: the strongest link it stands for, and the partner files there (strongest first). */
export interface LinkedBody { body: number; strengthMilli: number; step: 0 | 1 | 2; files: CoFile[] }

/** What a focus draws: lines to other bodies, partners named under the focused file, and test moons ticked. */
export interface FocusLinks {
  /** Strongest first; never the focused planet itself. */
  lines: LinkedBody[];
  /** File focus: partners on the focused planet's surface, or not drawn anywhere, named under the focused file ("with …"). */
  named: CoFile[];
  /** Partners that are the focused planet's own test moons: no line (it would cross the disc), a tick on the moon. */
  tests: CoFile[];
}

export interface Focus { planet: number; file: string | null }

/**
 * What the constellation is drawn for: the focused planet (and the review panel's open file on it), or
 * in free flight, where the panel lists the star's files, the open file when it is one of the star's
 * (planet -1; PR #214 r1, Qodo dc730060). Nothing otherwise.
 */
export function focusFor(index: CoIndex | null, planet: number | null, file: string | null): Focus | null {
  if (planet !== null) return { planet, file };
  return file !== null && index?.files.get(file)?.spot?.body === -1 ? { planet: -1, file } : null;
}

const none = (): FocusLinks => ({ lines: [], named: [], tests: [] });

/**
 * A focused planet's links: per other body, its strongest file pair with this planet, at most
 * PLANET_LINES; and the planet's files' test moons they change with. A focused file's: its COCHANGE.cap
 * strongest partners, one line per partner body at its strongest partner there.
 */
export function focusLinks(index: CoIndex | null, focus: Focus | null): FocusLinks {
  if (!index || !focus) return none();
  const P = focus.planet;
  const out = none();
  const tests = new Set<CoFile>();
  const bodies = new Map<number, LinkedBody>();
  const link = (g: CoFile, strengthMilli: number) => {
    const b = g.spot!.body;
    const had = bodies.get(b);
    if (!had) bodies.set(b, { body: b, strengthMilli, step: strengthStep(strengthMilli), files: [g] });
    else had.files.push(g); // partners come strongest first, so the first sets the line's strength
  };
  const file = focus.file === null ? null : index.files.get(focus.file);
  if (file && file.spot?.body === P) {
    for (const { file: g, strengthMilli } of (index.partners.get(file.fileId) ?? []).slice(0, COCHANGE.cap)) {
      if (!g.spot || (g.spot.body === P && g.spot.moon === null)) out.named.push(g);
      else if (g.spot.body === P) tests.add(g);
      else link(g, strengthMilli);
    }
    out.lines = [...bodies.values()];
  } else {
    const pairs: { g: CoFile; strengthMilli: number }[] = [];
    for (const f of index.files.values()) {
      if (f.spot?.body !== P) continue;
      for (const { file: g, strengthMilli } of index.partners.get(f.fileId) ?? []) {
        if (!g.spot) continue;
        if (g.spot.body !== P) pairs.push({ g, strengthMilli });
        else if (g.spot.moon !== null && f.spot.moon === null) tests.add(g);
      }
    }
    pairs.sort((a, b) => byStrength({ file: a.g, strengthMilli: a.strengthMilli }, { file: b.g, strengthMilli: b.strengthMilli }));
    for (const { g, strengthMilli } of pairs) if (!bodies.get(g.spot!.body)?.files.includes(g)) link(g, strengthMilli);
    out.lines = [...bodies.values()].sort((a, b) => b.strengthMilli - a.strengthMilli || a.body - b.body).slice(0, PLANET_LINES);
  }
  out.tests = [...tests].sort((a, b) => (a.fileId < b.fileId ? -1 : 1));
  return out;
}

/** Whether a flag's text shows: its own body or its partner's is focused, or either file is (the lab's flagInFocus). */
export const flagInFocus = (f: CoFlag, focus: Focus | null): boolean => !!focus
  && (focus.planet === f.file.spot?.body || focus.planet === f.with.spot?.body || focus.file === f.file.fileId || focus.file === f.with.fileId);

/** A flag's two lines of text. */
export const flagText = (f: CoFlag): [string, string] => (f.test ? [f.with.path, 'tests usually change with this'] : [f.file.path, `usually changes with ${f.with.path}`]);

/** The last two segments of a path: a partner file's name under its planet's label. */
export const shortName = (path: string): string => path.split('/').slice(-2).join('/');

const STEP_WORD = ['weak', 'mid', 'strong'] as const;

/**
 * The text equivalent for screen readers (Rule 1: nothing drawn only as pixels): the focus's links and
 * every standing flag, with the flags not drawn counted.
 */
export function coChangeLines(index: CoIndex | null, model: SystemModel, focus: Focus | null, dismissed = 0): string[] {
  if (!index) return [];
  const name = (body: number) => (body < 0 ? 'the star' : model.planets[body]?.path ?? 'a planet');
  const out: string[] = [];
  const links = focusLinks(index, focus);
  const parts = [
    ...links.lines.map((l) => `${focus?.file ? l.files.map((f) => f.path).join(', ') : name(l.body)} (${STEP_WORD[l.step]})`),
    ...links.named.map((f) => f.path),
    ...(links.tests.length ? ['its tests'] : []),
  ];
  if (parts.length) out.push(`usually changes with ${parts.join(', ')}`);
  for (const f of index.flags) out.push(`missing pair: ${flagText(f).join(': ')}`);
  const hidden = index.unplacedFlags;
  if (hidden > 0) out.push(`${hidden} missing ${hidden === 1 ? 'pair' : 'pairs'} not drawn`);
  if (dismissed > 0) out.push(`${dismissed} missing ${dismissed === 1 ? 'pair' : 'pairs'} charted`);
  return out;
}
