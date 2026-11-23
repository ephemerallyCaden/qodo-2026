// visual-proof (R4): the text for the PR description. Qodo can't see images, so each shot is said in
// numbers: pixels changed, their box, which part of the view, and the scene's own measures before and
// after; plus both commits, the data, the checks and the exact command. Same input, same text: no
// clock, no locale formatting, no absolute path.
import type { Box, Where } from './frames.js';

export interface Side { sha: string; subject: string; bundle: string }
export interface Shot {
  name: string;
  /** The frame index in the take (0-based, 20 frames a second of loop time). */
  k: number;
  px: number;
  total: number;
  box: Box | null;
  where: Where[];
  probes: { name: string; before: number | string; after: number | string }[];
}
export interface RunSummary {
  scene: { name: string; summary: string };
  before: Side;
  after: Side;
  data: { repoAt: string; sessions: number; drones: number; reducedMotion: boolean; viewport: string };
  /** Frames in each take. */
  frames: number;
  determinism: { takes: number; framesCompared: number; differing: number };
  privacy: { texts: number; responses: number; files: number; hits: number };
  shots: Shot[];
  images: { file: string; bytes: number; note: string }[];
  command: string;
}

/** Basis points as a percentage with two decimals, in integer maths (test/render/twin.ts's `share`). */
const share = (px: number, total: number) => {
  const bp = Math.floor((px * 10000) / total);
  return `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, '0')}%`;
};
const short = (sha: string) => sha.slice(0, 7);
const size = (bytes: number) => (bytes >= 1 << 20 ? `${(Math.floor((bytes * 10) / (1 << 20)) / 10).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function summaryText(s: RunSummary): string {
  const lines = [
    `### Visual proof: ${s.scene.name}`,
    '',
    `${s.scene.summary}.`,
    '',
    '| | Before | After |',
    '|---|---|---|',
    `| Commit | \`${short(s.before.sha)}\` ${s.before.subject} | \`${short(s.after.sha)}\` ${s.after.subject} |`,
    `| View bundle | \`${s.before.bundle}\` | \`${s.after.bundle}\` |`,
    '',
  ];
  s.shots.forEach((shot, i) => {
    lines.push(`**Shot ${i + 1}: ${shot.name} (take frame ${shot.k})**`);
    if (!shot.px) lines.push('- no pixel changed between before and after');
    else {
      const b = shot.box!;
      lines.push(`- ${shot.px} of ${shot.total} px changed (${share(shot.px, shot.total)}), box x ${b.x0}-${b.x1}, y ${b.y0}-${b.y1}`);
      lines.push(`- where: ${shot.where.map((w) => `${w.name} ${w.px}`).join(', ')}`);
    }
    for (const p of shot.probes) lines.push(`- ${p.name}: ${p.before} before, ${p.after} after`);
    lines.push('');
  });
  lines.push(
    `**Same data on both sides:** one clone of this repo at \`${short(s.data.repoAt)}\`, scanned once with \`--no-ingest\` (${plural(s.data.sessions, 'agent session')} read)` +
      `${s.data.drones ? `, ${plural(s.data.drones, 'scripted drone')} through the server's hooks` : ''}; viewport ${s.data.viewport}, ` +
      `loop time stepped 50 ms a take frame${s.data.reducedMotion ? ', reduced motion (the view clock holds at 0)' : ''}.`,
    `**Determinism:** each build captured twice (${s.determinism.takes} takes of ${s.frames} frames); ${s.determinism.differing} of ${s.determinism.framesCompared} frames differ between takes of the same build.`,
    `**Privacy:** ${s.privacy.texts} page texts, ${s.privacy.responses} API responses and ${s.privacy.files} state files scanned for absolute paths, tokens and agent-log fields: ${plural(s.privacy.hits, 'hit')}.`,
    `**Images** (attached by hand): ${s.images.map((im) => `${im.file} (${size(im.bytes)}, ${im.note})`).join('; ')}.`,
    '',
    `Command: \`${s.command}\``,
    '',
  );
  return lines.join('\n');
}
