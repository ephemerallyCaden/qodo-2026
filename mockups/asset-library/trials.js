// Trial looks: a proposed change to a shipped look, shown beside it so the human can judge it by
// eye before it's adopted (it never is here). A trial is a palette spec, like a history palette
// (palette.js lookPalette): applied in its own viewer palette, never as palette edits and never
// to the base, so it reaches only the planet that asks for it. Pure data, no DOM.
//
// dusty-ash is planet-health-looks P2 (mockups/health-looks/PROPOSALS.md, "B. A different ash look",
// variant C×0.6 L-0.1): the desert look's sand and rock ramps at OKLab chroma ×0.6 and lightness
// −0.1, hue kept. test/trials.test.mjs checks the ramps against PROPOSALS.md and the formula.
export const TRIALS = {
  'dusty-ash': {
    title: 'dustier ash',
    biome: 'desert', // the ash band's look
    proposal: 'P2', variant: 'C×0.6 L-0.1', k: 0.6, dL: -0.1, roles: ['sand', 'rock'],
    palette: {
      set: {
        sand: ['#422718', '#774e33', '#a57d56', '#c1a67e', '#d8cfaf'],
        rock: ['#110805', '#2c1b13', '#513728', '#785d46'],
      },
    },
    // measured in PROPOSALS.md (hero, normal vision): the ash look's mean L / warmth / chroma
    measured: { shipped: '0.643 / +0.084 / 0.090', trial: '0.555 / +0.048 / 0.051' },
    note: 'P2: sand and rock at chroma ×0.6, lightness −0.1. Fixes H1 at hero and the small-size H4 failures; at far distance ash comes within a glance of toxic',
  },
};
export const TRIAL_KEYS = Object.keys(TRIALS);
/** The trial a planet item shows, or null (a trial applies only to its own biome). */
export const trialOf = (it) => (it?.kind === 'planet' && TRIALS[it.trial]?.biome === it.biome ? TRIALS[it.trial] : null);
/** The trial key for a biome, or null. */
export const trialFor = (biome) => TRIAL_KEYS.find((k) => TRIALS[k].biome === biome) ?? null;
