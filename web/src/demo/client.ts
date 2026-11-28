// The demo's DataClient (live-demo L2): the real view's data interface over a baked dataset (source.ts).
// Reads come from the dataset's files, checked like the server's answers. Writes (chart, baseline,
// beacon) change an in-memory store for this visit only, and the next fog, unseen list, diff, beacon
// and co-change answers are what the real server would give after the same writes (src/core/fog,
// src/core/beacons). Nothing is stored or sent anywhere: a reload starts from the dataset again. After
// a write the client raises the event the server's watcher would (fog, beacons), in the page only.
import { API, type ChartResult, type DiffResult, type DiffView, type LiveEvent, type UnseenFile, type UnseenResult } from '../../../src/core/contract/api.js';
import { beaconTextProblem } from '../../../src/core/beacon-text.js';
import type { Beacon, BeaconAction, BeaconResult, BeaconView } from '../../../src/core/contract/beacons.js';
import type { CoChangeView } from '../../../src/core/contract/cochange.js';
import type { ChartAction, FogCounts, FogView } from '../../../src/core/contract/fog.js';
import type { CrewDetailResult } from '../../../src/core/contract/crew.js';
import type { DroneDetailResult } from '../../../src/core/contract/drones.js';
import type { DirId, FileId, Sha } from '../../../src/core/snapshot/types.js';
import { checkCrewDetail } from '../crew/check.js';
import { parseBeacons, parseChecked, parseCoChange, parseCrew, parseDrones, parseFog, parseLayout, parseTreeSource, ViewError, type DataClient } from '../data/client.js';
import { checkDroneDetail } from '../drones/check.js';
import { checkDiff, checkUnseen } from '../model/validate.js';
import { routeKey, unseenKey, type DemoSource } from './source.js';

/** How the demo names its data in errors: it has no server to blame. */
const SOURCE = 'the demo data';

type Home = DirId | 'star';

/** The demo's own refusal for a route its dataset doesn't cover: said, never answered as empty (Rule 1). */
const missing = (what: string) => new ViewError(`This demo has no ${what}.`, ['The demo runs on invented data, and it doesn\'t include this part.']);

/** What a write would refuse with when `at` isn't the head the dataset was baked at (#58). */
const unknownHead = (head: Sha) => ({ ok: false, error: 'unknown-head', head }) as const;

export interface DemoClient extends DataClient {
  /** Whether any write has happened this visit (the page says the demo's changes won't be kept). */
  wrote(): boolean;
}

export function demoClient(source: DemoSource): DemoClient {
  const has = (route: string) => source.routes.includes(route);
  const cache = new Map<string, Promise<unknown>>();
  /** A baked route, parsed once and kept (the dataset never changes during a visit). */
  const baked = <T>(route: string, parse: (text: string) => T): Promise<T> => {
    let p = cache.get(route) as Promise<T> | undefined;
    if (!p) {
      // a file the site couldn't serve is said as the view's own errors are, with what went wrong
      p = source.read(route).then(parse, (e: unknown) => { throw new ViewError('Some of the demo data couldn\'t be read.', [e instanceof Error ? e.message : String(e)]); });
      p.catch(() => cache.delete(route)); // tried again on the next ask
      cache.set(route, p);
    }
    return p;
  };
  const layoutOf = () => baked(API.layout, (t) => parseLayout(t, SOURCE));
  const baseFog = () => baked(API.fog, (t) => parseFog(t, SOURCE));
  const unseenOf = (route: string) => baked(route, (t) => parseChecked(t, 'unseen list', SOURCE, checkUnseen));
  const unseenRoutes = () => source.routes.filter((r) => r.startsWith(`${API.unseen}?`));

  // ---- the visit's writes ----
  /** Files charted this visit, each with the body its fog is counted on; and every file charted at all (co-change flags). */
  const charted = new Map<FileId, Home>();
  const everCharted = new Set<FileId>();
  const baselines: Sha[] = [];
  /** Notes left this visit, oldest first, and the baked notes they replaced (one note per file). */
  const notes: Beacon[] = [];
  const replaced = new Set<FileId>();
  let writes = 0;
  const listeners = new Set<(ev: LiveEvent) => void>();
  /** The event the server's watcher sends after a write, on the next task, as a real one arrives after the answer. */
  const raise = (ev: LiveEvent) => { setTimeout(() => { for (const l of listeners) l(ev); }, 0); };

  /** A fogged file is seen once charted this visit, or once any baseline stands (the dataset has one head). */
  const seen = (fileId: FileId) => baselines.length > 0 || charted.has(fileId);

  const fogNow = async (): Promise<FogView> => {
    const base = await baseFog();
    const flip = (c: FogCounts): FogCounts => ({ ...c, fogged: 0, haze: c.haze + c.fogged });
    const planets = base.planets.map((p) => ({ ...p }));
    let star = { ...base.star };
    if (baselines.length > 0) {
      planets.forEach((p, i) => { planets[i] = { dirId: p.dirId, ...flip(p) }; });
      star = flip(star);
    } else {
      for (const home of charted.values()) {
        const c = home === 'star' ? star : planets.find((p) => p.dirId === home)!;
        c.fogged--;
        c.haze++;
      }
    }
    return {
      ...base,
      baseline: baselines.at(-1) ?? base.baseline, // the visit's newest, else the dataset's own
      charted: base.charted || everCharted.size > 0,
      files: base.files.map((f) => (f.state === 'fogged' && seen(f.fileId) ? { fileId: f.fileId, state: 'haze', reasons: [], since: null } : f)),
      planets,
      star,
    };
  };

  /** The body a file is counted on: its place in the layout, else the baked unseen list that holds it. Null when the dataset doesn't say. */
  const homeOf = async (fileId: FileId): Promise<Home | null> => {
    const layout = await layoutOf();
    if (layout.star.moonlets.some((m) => m.fileId === fileId)) return 'star';
    for (const p of layout.planets) {
      if (p.surface.settlements.some((s) => s.fileId === fileId) || p.moons.some((m) => m.fileId === fileId)) return p.dirId;
    }
    for (const route of unseenRoutes()) {
      const list = await unseenOf(route).catch(() => null);
      if (list?.ok && list.files.some((f) => f.fileId === fileId)) return list.home ?? 'star';
    }
    return null;
  };

  /** A file's repo-relative path, from whichever baked answer names it. */
  const pathOf = async (fileId: FileId): Promise<string | null> => {
    for (const route of unseenRoutes()) {
      const list = await unseenOf(route).catch(() => null);
      const f = list?.ok ? list.files.find((x) => x.fileId === fileId) : undefined;
      if (f) return f.path;
    }
    const named = [
      ...(has(API.cochange) ? (await cochangeBase().catch(() => null))?.files ?? [] : []),
      ...(has(API.beacons) ? (await beaconsBase().catch(() => null))?.beacons ?? [] : []),
    ].find((x) => x.fileId === fileId);
    if (named) return named.path;
    if (has(API.snapshot)) return (await filesOf().catch(() => null))?.files.find((f) => f.id === fileId)?.path ?? null;
    return null;
  };

  /** The head the dataset was baked at: its layout's, which every view needs (a missing fog fails only what needs the fog). */
  const headNow = async (): Promise<Sha> => (await layoutOf()).source.head;
  const cochangeBase = () => baked(API.cochange, (t) => parseCoChange(t, SOURCE));
  const beaconsBase = () => baked(API.beacons, (t) => parseBeacons(t, SOURCE));
  const filesOf = () => baked(API.snapshot, (t) => parseTreeSource(t, SOURCE));

  const beaconsNow = async (): Promise<BeaconView> => {
    const head = await headNow();
    const base = has(API.beacons) ? await beaconsBase() : { schemaVersion: 'beacons.1' as const, head, beacons: [], unplaced: 0 };
    return { ...base, beacons: [...base.beacons.filter((b) => !replaced.has(b.fileId)), ...notes] };
  };

  const chart = async (action: ChartAction): Promise<ChartResult> => {
    const head = await headNow();
    if (action.at !== head) return unknownHead(head);
    if (action.kind === 'baseline') baselines.push(action.at);
    else if (action.kind === 'baseline-undo') {
      // Only a baseline set this visit can be undone: the dataset's own is baked into its fog, which the demo
      // can't replay without it. Refused, so nothing is shown as fogged or seen that the server wouldn't.
      if (baselines.length === 0) return { ok: false, error: (await baseFog()).baseline === null ? 'no baseline to undo' : 'the demo can\'t undo the baseline its invented data starts with' };
      baselines.pop();
    } else {
      const file = (await baseFog()).files.find((f) => f.fileId === action.fileId);
      if (!file) return { ok: false, error: 'no such file at that head' };
      if (file.state === 'fogged' && !charted.has(file.fileId)) {
        const home = await homeOf(file.fileId);
        if (home === null) return { ok: false, error: 'the demo data doesn\'t say where this file is' };
        charted.set(file.fileId, home);
      }
      everCharted.add(file.fileId);
    }
    writes++;
    raise({ type: 'fog', head });
    return { ok: true, fog: await fogNow() };
  };

  const beacon = async (action: BeaconAction): Promise<BeaconResult> => {
    const head = await headNow();
    if (action.at !== head) return unknownHead(head);
    const problem = beaconTextProblem(action.text);
    if (problem) return { ok: false, error: problem };
    if (!(await baseFog()).files.some((f) => f.fileId === action.fileId)) return { ok: false, error: 'no such file at that head' };
    const [home, path] = await Promise.all([homeOf(action.fileId), pathOf(action.fileId)]);
    if (home === null || path === null) return { ok: false, error: 'the demo data doesn\'t say where this file is' };
    // One note per file, as the server keeps them: a new one replaces any earlier note on it.
    const earlier = notes.findIndex((b) => b.fileId === action.fileId);
    if (earlier >= 0) notes.splice(earlier, 1);
    replaced.add(action.fileId);
    notes.push({ fileId: action.fileId, path, home, at: action.at, text: action.text });
    writes++;
    raise({ type: 'beacons', head });
    return { ok: true, beacons: await beaconsNow() };
  };

  const unseen = async (home: DirId | null, at: Sha): Promise<UnseenResult> => {
    const fog = await fogNow();
    if (at !== fog.head) return unknownHead(fog.head);
    const counts = home === null ? fog.star : fog.planets.find((p) => p.dirId === home);
    if (!counts) return { ok: false, error: 'no-such-home' };
    const route = unseenKey(home);
    if (!has(route)) {
      if (counts.fogged === 0) return { ok: true, at, home, files: [] };
      throw missing('review list for this planet');
    }
    const list = await unseenOf(route);
    if (!list.ok) throw new ViewError(`The unseen list from ${SOURCE} is a refusal.`);
    const files: UnseenFile[] = list.files.filter((f) => !seen(f.fileId));
    return { ok: true, at, home, files };
  };

  const diff = async (fileId: FileId, at: Sha): Promise<DiffResult> => {
    const fog = await fogNow();
    if (at !== fog.head) return unknownHead(fog.head);
    const file = fog.files.find((f) => f.fileId === fileId);
    if (!file) return { ok: false, error: 'no-such-file' };
    // Nothing unseen (charted this visit, or never fogged): the server's answer is an empty diff.
    if (file.state !== 'fogged') return { ok: true, fileId, at, since: null, base: null, sections: [], truncated: false, shownLines: 0 } satisfies DiffView;
    const route = routeKey(API.diff, fileId);
    if (!has(route)) throw missing('diff for this file');
    return baked(route, (t) => parseChecked(t, 'diff', SOURCE, checkDiff));
  };

  const cochange = async (): Promise<CoChangeView> => {
    // No co-change in the dataset is said, never drawn as a complete view with nothing in it (Rule 1).
    if (!has(API.cochange)) throw missing('co-change data');
    const base = await cochangeBase();
    // A flag clears once its file is charted at or after the change that raised it; the dataset has one head, so any chart or baseline does.
    const standing = base.flags.filter((f) => baselines.length === 0 && !everCharted.has(f.fileId));
    return { ...base, flags: standing, dismissed: base.dismissed + base.flags.length - standing.length };
  };

  return {
    wrote: () => writes > 0,
    layout: layoutOf,
    fog: fogNow,
    drones: async () => {
      if (!has(API.drones)) throw missing('agent sessions');
      return baked(API.drones, (t) => parseDrones(t, SOURCE));
    },
    droneDetail: async (key, at): Promise<DroneDetailResult> => {
      const head = await headNow();
      if (at !== head) return unknownHead(head);
      const route = routeKey(API.droneDetail, key);
      if (!has(route)) return { ok: false, error: 'no-such-session' };
      return baked(route, (t) => parseChecked(t, 'session detail', SOURCE, checkDroneDetail));
    },
    crew: async () => {
      if (!has(API.crew)) throw missing('crew');
      return baked(API.crew, (t) => parseCrew(t, SOURCE));
    },
    crewDetail: async (person, at): Promise<CrewDetailResult> => {
      const head = await headNow();
      if (at !== head) return unknownHead(head);
      const route = routeKey(API.crewDetail, person);
      if (!has(route)) return { ok: false, error: 'no-such-person' };
      return baked(route, (t) => parseChecked(t, 'crew detail', SOURCE, checkCrewDetail));
    },
    unseen,
    diff,
    chart,
    beacons: beaconsNow,
    beacon,
    cochange,
    files: async () => {
      if (!has(API.snapshot)) throw missing('file list');
      return filesOf();
    },
    // No server, so no stream: the only events are the ones this visit's own writes raise.
    follow(onEvent) {
      listeners.add(onEvent);
      return () => { listeners.delete(onEvent); };
    },
  };
}
