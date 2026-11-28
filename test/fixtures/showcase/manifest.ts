// The showcase fixture's index (live demo L1): which committed file answers which read route of
// `commet open`. Types and names only, no Node imports, so the demo's client can import it.
// Every file in data/ is one route's exact response body (pretty-printed JSON), at the fixture's head.
import type { DirId, FileId, PersonId, SessionKey, Sha } from '../../../src/core/snapshot/types.js';

/** The folder the files live in, beside this module. */
export const SHOWCASE_DATA_DIR = 'data';
/** The index itself, in that folder. */
export const SHOWCASE_MANIFEST = 'showcase.manifest.json';

/**
 * `routes`: the read routes that take no query, path → file. The query routes each take `at`, which must be
 * `head` (the server answers 409 for any other), and one key:
 * - `droneDetail`: `GET /api/drone-detail?key=<SessionKey>&at=<head>`, by session key (every non-inferred session);
 * - `crewDetail`: `GET /api/crew-detail?person=<PersonId>&at=<head>`, by person id (every crew member);
 * - `unseen`: `GET /api/unseen?home=<DirId>|star&at=<head>`, by planet id or `star` (every planet in the layout, and the star);
 * - `diff`: `GET /api/diff?fileId=<FileId>&at=<head>`, by file id (every file an `unseen` list names: the review panel's files).
 * A key that isn't listed is the server's 404 (`no-such-session`, `no-such-person`, `no-such-home`, `no-such-file`).
 * Writes (`POST /api/chart`, `POST /api/beacon`) and `GET /api/events` have no file: the demo answers them itself.
 */
export interface ShowcaseManifest {
  schemaVersion: 'showcase.1';
  head: Sha;
  routes: {
    '/api/snapshot': string;
    '/api/layout': string;
    '/api/fog': string;
    '/api/drones': string;
    '/api/crew': string;
    '/api/cochange': string;
    '/api/beacons': string;
  };
  droneDetail: Record<SessionKey, string>;
  crewDetail: Record<PersonId, string>;
  unseen: Record<DirId | 'star', string>;
  diff: Record<FileId, string>;
}

/** The file name of each response: `showcase.<route>[.<key>].json`. */
export const showcaseFile = (route: string, key?: string): string => `showcase.${route}${key === undefined ? '' : `.${key}`}.json`;
