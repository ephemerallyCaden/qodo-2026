// View.setCrew under overlapping refreshes (#207, Qodo PR #227 24038926): a crew refresh compiles its ship
// before drawing it, so two refreshes of the same scan can finish out of order. The newest call must win: an
// older one that finishes compiling later changes nothing and says so (false), or the ship drawn and the seats
// the crew controller clicks would be of different crews. The renderer is a fake whose compiles this test
// finishes by hand; the scene, ship and seats are the view's own.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { miniLayout } from '../../fixtures/contract/mini.js';
import type { Rider } from '../../../web/src/render/ship.js';

const gl = vi.hoisted(() => ({
  /** Each compile waits here until the test resolves it; null resolves at once. */
  gates: null as (() => void)[] | null,
}));

vi.mock('../../../web/src/render/pixel.js', () => ({
  PixelPass: class {
    height = 180;
    scale = 4;
    canvas = { width: 1280, height: 720, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) };
    renderer = {
      info: { programs: [] },
      compileAsync: () => (gl.gates ? new Promise<void>((r) => gl.gates!.push(r)) : Promise.resolve()),
    };
    takeShaderErrors() { return []; }
    compileOverlay() {}
  },
}));
vi.mock('../../../web/src/labels/overlay.js', async (original) => ({
  ...(await original<typeof import('../../../web/src/labels/overlay.js')>()),
  LabelLayer: class { px = 2; canvas = {}; },
}));

const { View } = await import('../../../web/src/view.js');

const head = miniLayout.source.head;
/** n riders, the first the captain. */
const crew = (n: number): Rider[] => Array.from({ length: n }, (_, i) => ({ person: `p_${(i + 1).toString(16).padStart(12, '0')}`, seed: i * 7919, captain: i === 0 }));

describe('View.setCrew: the newest crew wins', () => {
  let view: InstanceType<typeof View>;
  beforeEach(async () => {
    gl.gates = null;
    view = new View({} as HTMLCanvasElement, {} as HTMLCanvasElement);
    await view.load(miniLayout);
    expect(await view.setCrew(crew(3), 0, head)).toBe(true);
    gl.gates = [];
  });

  it('an older refresh that finishes compiling after a newer one changes nothing', async () => {
    const older = view.setCrew(crew(16), 4, head);
    const newer = view.setCrew(crew(6), 0, head);
    gl.gates![1]!(); // the newer ship's compile finishes first
    expect(await newer).toBe(true);
    expect(view.crewSpec?.plan.drawn).toBe(6);
    gl.gates![0]!(); // then the older one's
    expect(await older).toBe(false);
    expect(view.crewSpec?.plan.drawn).toBe(6); // still the newer crew, the one the controller seats
    expect(view.crewSeat('p_00000000000f')).toBeNull(); // nobody of the older crew is aboard
  });

  it('a newer empty crew (nothing to compile) wins over an older one still compiling', async () => {
    const older = view.setCrew(crew(8), 0, head);
    expect(await view.setCrew([], 0, head)).toBe(true);
    expect(view.crewSpec).toBeNull();
    gl.gates![0]!();
    expect(await older).toBe(false);
    expect(view.crewSpec).toBeNull();
  });

  it('in order, each refresh draws its own crew', async () => {
    const first = view.setCrew(crew(16), 4, head);
    gl.gates![0]!();
    expect(await first).toBe(true);
    expect(view.crewSpec?.plan.drawn).toBe(16);
    const second = view.setCrew(crew(6), 0, head);
    gl.gates![1]!();
    expect(await second).toBe(true);
    expect(view.crewSpec?.plan.drawn).toBe(6);
  });
});
