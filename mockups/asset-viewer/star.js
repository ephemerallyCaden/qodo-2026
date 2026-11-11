// The star (star-art.md S1-S7): one per repo, at the centre of its system, with a constant look
// (its colour carries no data). The Day 1 GIF's sun, ported: that sun was the D1 star
// (feature/day1-gifs fd931c1, mockups/day1-gifs/star.js), drawn with this viewer's own noise and
// depth fade. Its bands, cuts and corona are D1's; this port adds a loop-locked spin, a
// granulation amount and moonlets.
//   disc     five flat bands by limb angle (limb darkening): red-orange limb, orange, yellow,
//            cream, cream-white core. A granulation field wobbles the band edges: fbm cells plus
//            fine simplex grain, churning on a circle in noise space (one lap per loop) while the
//            sphere turns whole turns per loop, so the surface never looks flat and returns to itself.
//   corona   flat bands (no dithering, art direction §3): a red-orange crown that licks past the
//            limb, then a thin dark-red halo, with a lumpy edge whose lumps ride the same circle.
//            It's a billboard facing the eye, built in the vertex shader, so it hugs the disc's
//            silhouette from any camera. It carries the dark-red rim; off, the disc ends at its red-orange limb.
//   moonlets root files and unmatched tests (#18): the planets' moon look (the viewer's moon
//            material), on one orbit, one orbit per surface turn, at a fixed size (no size data).
// Emissive and unlit, everywhere: no terminator, no crust. It fades per pixel at D1's light
// strength (STAR_FADE), so the cream core stays the hottest point at any distance.
//
// viewer.js builds the factory once with its vertex shader, noise, depth GLSL and uniforms, loop
// and moon material (starFactory below), so the star fades and loops exactly like everything else.
import * as THREE from 'three';

// The ramps, from the v2 world family only (no new colour): the lava glow (rim, body, hot cores),
// then the sand ramp's top and the cloud ramp's top; the corona's crown is the glow rim and its
// halo is gas giant B's darkest step. Dark -> light, like every ramp.
export const STAR_RAMPS = {
  star: ['#c9361a', '#ff761a', '#ffc93c', '#fff0b8', '#fffaf0'],
  corona: ['#c9361a', '#481a18'],
};
// Every palette carries the two roles, from its own ramps: for 'final' they are STAR_RAMPS
// (test/star.test.mjs checks), for the published Lospec palettes their own glow, sand, cloud and gas giant B.
export function bindPalettes(palettes) {
  for (const pal of Object.values(palettes)) {
    pal.star ??= [...pal.glow.slice(0, 3), pal.sand.at(-1), pal.cloud.at(-1)];
    pal.corona ??= [pal.glow[0], pal.gasB[0]];
  }
}

// Inspector ranges and defaults. size: the star's radius (world units; a hero planet is 1).
// spin: whole turns per loop. granulation: how far the cells wobble the band edges (1 = Day 1).
// moonlets: how many.
export const STAR = { size: [0.5, 3], spin: [0, 3], granulation: [0, 2], moonlets: [0, 12] };
export const STAR_DEFAULTS = { size: 1.6, spin: 1, granulation: 1, corona: true, moonlets: 0 };
// Depth-fade strength (S5): D1's. It reproduces the Day 1 GIF's sun exactly; at lava glow's 0.5 the
// cream core greys (#adabb4 at the GIF's scale) and reads as a dull ember (screenshots/star/star-vs-day1.png).
export const STAR_FADE = 0.15;
export const MOONLET = { radius: 0.11, orbit: 1.7 }; // radius in world units (the big moon's at hero size: ~9 px at hero range, one size for all); orbit in star radii, clear of the corona
const CUTS = [0.27, 0.5, 0.72, 0.9]; // D1's band cuts on the wobbled limb value
const CORONA_SPAN = 1.4; // the billboard's half-size in star radii (the corona reaches ~1.3)
const INV_PHI = 0.6180339887498949;
const fract = (x) => x - Math.floor(x);

/** deps: { vert, noise, depthGlsl, depthUniforms(family), loop ({ surfaceTurns }), moonMaterial(), moonGeo }. Returns { makeStar }. */
export function starFactory({ vert, noise, depthGlsl, depthUniforms, loop, moonMaterial, moonGeo }) {
  const DISC_FRAG = /* glsl */ `
    ${noise}
    ${depthGlsl}
    uniform vec3 uRamp[5];
    uniform vec2 uChurn;  // (cos, sin) of the churn angle: one lap per loop
    uniform float uGran;  // granulation amount (1 = the Day 1 look)
    uniform float uFade;
    in vec3 vNormalW;
    in vec3 vPosW;
    in vec3 vLocal;
    void main() {
      vec3 n = normalize(vNormalW), v = normalize(cameraPosition - vPosW), p = normalize(vLocal);
      float mu = dot(n, v);                                       // 1 at the centre of the disc, 0 at the limb
      float g = fbm(p * 2.6 + vec3(uChurn * 0.7, 0.0));           // churning cells
      float g2 = snoise(p * 6.5 + vec3(0.0, uChurn.yx * 0.45));   // fine granulation
      float m = mu + ((g - 0.5) * 0.42 + g2 * 0.05) * uGran;
      int i = m > ${CUTS[3]} ? 4 : m > ${CUTS[2]} ? 3 : m > ${CUTS[1]} ? 2 : m > ${CUTS[0]} ? 1 : 0;
      gl_FragColor = vec4(depthFade(uRamp[i], vPosW, uFade), 1.0);
    }
  `;
  // The corona billboard: a quad in the plane through the star's centre that faces the eye, so the
  // disc's silhouette (a circle in that plane) and the corona's rings share one centre from any
  // camera. Its frame keeps the camera's up, so the lumps hold their place on screen.
  const CORONA_VERT = /* glsl */ `
    uniform float uSpan;
    out vec2 vUv;
    out vec3 vPosW;
    void main() {
      vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float r = length(modelMatrix[0].xyz); // the star's radius (uniform scale)
      vec3 axis = normalize(cameraPosition - c);
      vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      vec3 up = camUp - axis * dot(camUp, axis);
      up = dot(up, up) < 1e-6 ? vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]) : normalize(up);
      vec3 right = normalize(cross(up, axis));
      vUv = position.xy; // -1..1
      vPosW = c + (right * position.x + cross(axis, right) * position.y) * r * uSpan;
      gl_Position = projectionMatrix * viewMatrix * vec4(vPosW, 1.0);
    }
  `;
  const CORONA_FRAG = /* glsl */ `
    ${noise}
    ${depthGlsl}
    uniform vec3 uCorona[2];
    uniform vec2 uChurn;
    uniform float uSpan;
    uniform float uFade;
    in vec2 vUv;
    in vec3 vPosW;
    void main() {
      float r = length(vUv) * uSpan;
      if (r < 0.97) discard; // behind the disc
      vec2 a = normalize(vUv);
      float f = fbm(vec3(a * 1.7, 0.0) + vec3(0.0, uChurn * 0.55));     // lumps around the rim, loop-locked
      float f2 = fbm(vec3(a * 4.2, 3.0) + vec3(uChurn.yx * 0.35, 0.0));
      float crown = 1.035 + 0.16 * pow(max(f - 0.38, 0.0) * 2.2, 2.0) + 0.03 * f2;
      float halo = 1.13 + 0.1 * f + 0.04 * f2;
      if (r > halo) discard;
      gl_FragColor = vec4(depthFade(r < crown ? uCorona[0] : uCorona[1], vPosW, uFade), 1.0);
    }
  `;
  const DISC_GEO = new THREE.SphereGeometry(1, 64, 40);
  const QUAD_GEO = new THREE.PlaneGeometry(2, 2);
  const ramp = (hexes) => ({ value: hexes.map((h) => new THREE.Color(h)) });

  function makeStar() {
    const group = new THREE.Group();
    group.userData.depthFamily = 'planet'; // the world's tint slot of the per-pixel depth fade
    const churn = { value: new THREE.Vector2(1, 0) };
    const fade = { value: STAR_FADE };
    const discMat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: DISC_FRAG,
      uniforms: { ...depthUniforms(0), uRamp: ramp(STAR_RAMPS.star), uChurn: churn, uGran: { value: 1 }, uFade: fade },
    });
    discMat.userData.ramps = { uRamp: 'star' };
    const coronaMat = new THREE.ShaderMaterial({
      vertexShader: CORONA_VERT, fragmentShader: CORONA_FRAG, depthWrite: false,
      uniforms: { ...depthUniforms(0), uCorona: ramp(STAR_RAMPS.corona), uChurn: churn, uSpan: { value: CORONA_SPAN }, uFade: fade },
    });
    coronaMat.userData.ramps = { uCorona: 'corona' };
    const body = new THREE.Group(); // the star's radius; the disc turns inside it
    const disc = new THREE.Mesh(DISC_GEO, discMat);
    const corona = new THREE.Mesh(QUAD_GEO, coronaMat);
    corona.frustumCulled = false; // placed in the vertex shader
    corona.renderOrder = 1; // after the opaque disc: its depth hides the quad's inner part
    body.add(disc, corona);
    group.add(body);

    // Moonlets: the planets' moon look, at a fixed size, so they sit outside the star's scale.
    const moonMat = moonMaterial();
    const moonlets = new THREE.Group();
    group.add(moonlets);

    let opts = { ...STAR_DEFAULTS };
    /** Any of size, spin, granulation, corona, moonlets (STAR_DEFAULTS for the rest). */
    function set(next = {}) {
      opts = { ...STAR_DEFAULTS, ...next };
      body.scale.setScalar(opts.size);
      discMat.uniforms.uGran.value = opts.granulation;
      corona.visible = opts.corona;
      const n = Math.max(0, Math.round(opts.moonlets));
      while (moonlets.children.length > n) moonlets.remove(moonlets.children.at(-1));
      while (moonlets.children.length < n) {
        const m = new THREE.Mesh(moonGeo, moonMat);
        m.scale.setScalar(MOONLET.radius);
        moonlets.add(m);
      }
    }
    set();

    /** phase in [0, 1): position in the shared loop. */
    function update(phase) {
      const a = phase * Math.PI * 2;
      churn.value.set(Math.cos(a), Math.sin(a)); // one lap per loop
      disc.rotation.y = -a * Math.round(opts.spin); // whole turns per loop, right -> left like the planets
      // each moonlet orbits once per surface turn; slots sit golden-ratio steps apart, nearly in the orbital plane
      const orbit = MOONLET.orbit * opts.size;
      moonlets.children.forEach((m, slot) => {
        const k = fract(slot * INV_PHI);
        const incl = 0.15 * (k - 0.5);
        const b = a * loop.surfaceTurns + k * Math.PI * 2;
        m.position.set(Math.cos(b) * orbit, -Math.sin(b) * orbit * Math.sin(incl), Math.sin(b) * orbit * Math.cos(incl));
      });
    }

    return { group, set, update, parts: { disc, corona, moonlets } };
  }
  return { makeStar };
}
