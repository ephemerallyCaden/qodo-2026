// Dev only (`vite` dev server, `?fixture=<name>`): serves the contract fixtures through the same
// parse-and-check path and error messages as the real server, so the view can be developed before
// #32 lands. main.ts imports this behind `import.meta.env.DEV`, so it and the fixtures never reach dist/web.
import { API } from '../../../src/core/contract/api.js';
import { httpError, parseFog, parseLayout, ViewError, type DataClient } from './client.js';

const RAW = import.meta.glob<string>('../../../test/fixtures/contract/*.json', { query: '?raw', import: 'default' });
const file = async (name: string): Promise<string> => {
  const load = RAW[`../../../test/fixtures/contract/${name}`];
  if (!load) throw httpError(API.layout, 404);
  return load();
};

/** Each dev fixture's layout document: mini, mini with no planets or moonlets, a broken one, or a 404. */
const LAYOUTS: Readonly<Record<string, () => Promise<string>>> = {
  mini: () => file('mini.layout.json'),
  empty: async () => {
    const l = JSON.parse(await file('mini.layout.json')) as { star: object };
    return JSON.stringify({ ...l, planets: [], star: { ...l.star, moonlets: [] } });
  },
  invalid: async () => JSON.stringify({ schemaVersion: 'layout.1', constants: {}, star: { moonlets: 'none' }, planets: [{ path: 'src' }] }),
  missing: () => Promise.reject(httpError(API.layout, 404)),
};

export function fixtureClient(name: string): DataClient {
  const layout = LAYOUTS[name];
  return {
    layout: async () => {
      if (!layout) throw new ViewError(`No dev fixture "${name}".`, [`Try ?fixture=${Object.keys(LAYOUTS).join(', ')}.`]);
      return parseLayout(await layout(), `fixture ${name}`);
    },
    fog: async () => parseFog(await file('mini.fog.json'), `fixture ${name}`),
    follow: (_onEvent, onStatus) => { onStatus(`dev fixture ${name}`); return () => {}; },
    // Reviewing needs a repository: the fixtures have no paths or diffs (#75).
    unseen: () => Promise.reject(new ViewError('Reviewing needs `commet open`: the dev fixtures have no diffs.')),
    diff: () => Promise.reject(new ViewError('Reviewing needs `commet open`: the dev fixtures have no diffs.')),
    chart: () => Promise.reject(new ViewError('Charting needs `commet open`: the dev fixtures have no chart state.')),
  };
}
