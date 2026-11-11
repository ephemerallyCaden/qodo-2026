// The view's input boundary (#30): layout/fog checks, the token, the event stream, the label font,
// and the CPU noise port the cloud placement relies on.
import { describe, expect, it } from 'vitest';
import { FONT_HEIGHT, MISSING, glyph, hasGlyph, rasterText } from '../../web/src/labels/font.js';
import { EventStreamParser, parseLiveEvent } from '../../web/src/data/sse.js';
import { tokenFromHash } from '../../web/src/data/token.js';
import { checkFog, checkLayout } from '../../web/src/model/validate.js';
import { cellHash, crackMask, crackShare, poolField, snoise, voronoiCells } from '../../web/src/render/noise.js';
import { miniFog, miniLayout } from '../fixtures/contract/mini.js';

const errorsOf = (v: unknown) => { const c = checkLayout(v); return c.ok ? [] : c.errors; };

describe('checkLayout', () => {
  it('accepts the contract fixture', () => {
    expect(checkLayout(structuredClone(miniLayout)).ok).toBe(true);
  });

  it('names what is wrong, with its path', () => {
    const bad = structuredClone(miniLayout) as unknown as { planets: Record<string, unknown>[] };
    bad.planets[1]!['radiusMilli'] = 7.5;
    (bad.planets[2]!['health'] as Record<string, unknown>)['band'] = 'mauve';
    (bad.planets[0]!['slot'] as Record<string, unknown>)['phaseMilliturn'] = 1000;
    expect(errorsOf(bad)).toEqual([
      'layout.planets[0].slot.phaseMilliturn must be between 0 and 999',
      'layout.planets[1].radiusMilli must be an integer',
      'layout.planets[2].health.band must be one of lava, toxic, ash, healthy',
      // the fixture's settlements share their planet's health object, so the clone breaks theirs too
      'layout.planets[2].surface.settlements[0].health.band must be one of lava, toxic, ash, healthy',
      'layout.planets[2].surface.settlements[1].health.band must be one of lava, toxic, ash, healthy',
    ]);
  });

  it('checks the rest of the contract too: source, constants, star and the surface records', () => {
    const bad = structuredClone(miniLayout) as unknown as Record<string, Record<string, unknown>>;
    delete bad['source'];
    delete bad['constants']!['moonCap'];
    bad['star']!['repoId'] = '';
    const docs = (bad['planets'] as unknown as Record<string, Record<string, unknown>>[])[2]!;
    (docs['surface']!['grid'] as Record<string, unknown>)['kind'] = 'hex';
    ((docs['surface']!['settlements'] as Record<string, unknown>[])[0]!)['size'] = 9;
    expect(errorsOf(bad)).toEqual([
      'layout.source must be an object',
      'layout.constants.moonCap must be an integer',
      'layout.star.repoId must be a non-empty string',
      'layout.planets[2].surface.grid.kind must be "fibonacci"',
      'layout.planets[2].surface.settlements[0].size must be between 1 and 4',
    ]);
  });

  it('accepts content roots and zones (#71), and names a bad one', () => {
    const roots = structuredClone(miniLayout);
    roots.source.roots = ['packages', 'src'];
    roots.planets[0]!.zone = 'content';
    expect(checkLayout(roots).ok).toBe(true);
    const bad = structuredClone(miniLayout) as unknown as { source: Record<string, unknown>; planets: Record<string, unknown>[] };
    bad.source['roots'] = ['src', ''];
    bad.planets[1]!['zone'] = 'inner';
    delete bad.planets[2]!['zone'];
    expect(errorsOf(bad)).toEqual([
      'layout.source.roots[1] must be a non-empty string',
      'layout.planets[1].zone must be one of content, outer',
      'layout.planets[2].zone must be one of content, outer',
    ]);
    delete bad.source['roots'];
    expect(errorsOf(bad)[0]).toBe('layout.source.roots must be an array');
  });

  it('refuses other schemas and non-objects without listing every field', () => {
    expect(errorsOf({ schemaVersion: 'layout.2' })).toEqual(['layout.schemaVersion must be "layout.1" (got "layout.2")']);
    expect(errorsOf(null)).toEqual(['layout must be an object']);
    expect(errorsOf([])).toEqual(['layout must be an object']);
  });

  it('caps a garbage document at a short list', () => {
    const errs = errorsOf({ schemaVersion: 'layout.1', planets: Array.from({ length: 20 }, () => ({})) });
    expect(errs).toHaveLength(9);
    expect(errs.at(-1)).toMatch(/^…and \d+ more$/);
  });
});

describe('checkFog', () => {
  it('refuses a fog view with its required fields missing', () => {
    const c = checkFog({ schemaVersion: 'fog.1', head: 'x', files: [], planets: [{}], star: {} });
    expect(c.ok ? [] : c.errors).toEqual([
      'fog.baseline must be a non-empty string',
      'fog.planets[0].dirId must be a non-empty string',
      'fog.planets[0].total must be an integer',
      'fog.planets[0].fogged must be an integer',
      'fog.star.total must be an integer',
      'fog.star.fogged must be an integer',
    ]);
    const counts = checkFog({ ...structuredClone(miniFog), star: { total: 1, fogged: 2 } });
    expect(counts.ok ? [] : counts.errors).toEqual(['fog.star.fogged must not exceed total']);
  });

  it('accepts the contract fixture and refuses a broken one', () => {
    expect(checkFog(structuredClone(miniFog)).ok).toBe(true);
    const c = checkFog({ ...structuredClone(miniFog), files: [{ fileId: 'x', state: 'hazy' }] });
    expect(c.ok ? [] : c.errors).toEqual([
      'fog.files[0].fileId must start with "f_"',
      'fog.files[0].state must be one of clear, charted, fogged',
      'fog.files[0].reasons must be an array',
      'fog.files[0].since must be a non-empty string',
    ]);
  });
});

describe('tokenFromHash', () => {
  const T = 'aB3-_cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV3wX4yZ5a'; // 43 chars: 32 bytes in base64url, as #32 makes it
  it('reads #t=<token>', () => {
    expect(tokenFromHash(`#t=${T}`)).toBe(T);
    expect(tokenFromHash(`#x=1&t=${T}`)).toBe(T);
  });
  it('refuses a missing, short or unsafe token', () => {
    expect(tokenFromHash('')).toBeNull();
    expect(tokenFromHash('#t=')).toBeNull();
    expect(tokenFromHash('#t=short')).toBeNull();
    expect(tokenFromHash(`#t=${T}%0d%0aX-Evil: 1`)).toBeNull();
    expect(tokenFromHash(`#t=${'a'.repeat(300)}`)).toBeNull();
  });
});

describe('EventStreamParser', () => {
  const ev = (type: string) => `data: {"type":"${type}","head":"abc"}`;
  it('parses events split across chunks and CRLF boundaries', () => {
    const p = new EventStreamParser();
    const text = `: commet live updates\r\n\r\n${ev('layout')}\r\n\r\n${ev('fog')}\n\n`;
    const out = [];
    for (let i = 0; i < text.length; i += 3) out.push(...p.push(text.slice(i, i + 3)));
    expect(out).toEqual([{ type: 'layout', head: 'abc' }, { type: 'fog', head: 'abc' }]);
    expect(p.rejected).toBe(0);
  });

  it('splits a CR from its LF across chunks without a phantom event', () => {
    const p = new EventStreamParser();
    expect(p.push(`${ev('snapshot')}\r`)).toEqual([]);
    expect(p.push('\n\r')).toEqual([{ type: 'snapshot', head: 'abc' }]);
    expect(p.push('\n')).toEqual([]);
  });

  it('counts events that are not LiveEvents instead of passing them on', () => {
    const p = new EventStreamParser();
    expect(p.push('data: nope\n\ndata: {"type":"chart","head":"x"}\n\n')).toEqual([]);
    expect(p.rejected).toBe(2);
    expect(parseLiveEvent('{"type":"fog"}')).toBeNull();
  });
});

describe('bitmap font', () => {
  it('has rectangular glyphs no taller than a line', () => {
    for (const ch of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ._-/:()[]+#@') {
      expect(hasGlyph(ch)).toBe(true);
      const g = glyph(ch);
      expect(g.length).toBeLessThanOrEqual(FONT_HEIGHT);
      expect(new Set(g.map((r) => r.length)).size).toBe(1);
    }
  });

  it('draws an accented letter as its base letter, so names stay readable and distinct', () => {
    expect(glyph('é')).toBe(glyph('e'));
    expect(glyph('Å')).toBe(glyph('A'));
    expect(rasterText('café').w).toBe(rasterText('cafe').w);
  });

  it('draws a missing character as ?, never dropping it', () => {
    expect(glyph('€')).toBe(glyph(MISSING));
    expect(rasterText('a€').w).toBe(rasterText('a?').w);
  });

  it('rasterises proportionally with one column between glyphs', () => {
    expect(rasterText('').w).toBe(0);
    expect(rasterText('i').w).toBe(1);
    expect(rasterText('ii').w).toBe(3);
    const m = rasterText('l');
    expect(m.h).toBe(FONT_HEIGHT);
    expect([...m.bits].filter(Boolean).length).toBe(5);
  });
});

// Reference values from the asset viewer's CPU port (feature/asset-library, mockups/asset-viewer/snoise.js
// at 7157db7), which its own tests pin to the GPU. The cloud and lava-smoke placement read these fields.
describe('noise port', () => {
  it('matches the asset viewer bit for bit', () => {
    expect([snoise(0.1, 0.2, 0.3), snoise(12.5, -3.25, 7.75), snoise(-40.1, 22.2, 5.5)])
      .toEqual([-0.4755018089449937, -0.21659883932658466, 0.25768833332524144]);
    expect(voronoiCells(12.5, -3.25, 7.75)).toEqual({ edge: 0.10510303601226638, own: [12, -4, 7], across: [13, -4, 8] });
    expect(voronoiCells(0.1, 0.2, 0.3)).toEqual({ edge: 0.0012869078388235828, own: [0, 0, 0], across: [-1, 0, 0] });
    expect(cellHash(3, -7, 11)).toEqual([0.8706699013710022, 0.6686618328094482, 0.3691217601299286]);
    expect(poolField([3, -7, 11], [1.5, 2.5, 3.5], 0.3)).toBe(0.3822817196996733);
    expect(crackMask([0.6, 0, 0.8], 3.2, [1.5, 2.5, 3.5])).toBe(0.7328528249025473);
    expect(crackShare(0.7, 0.25, 0.1)).toBe(1);
  });
});
