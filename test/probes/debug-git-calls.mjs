/* global process, console */
// Probe (privacy-safe): for Bash calls that may create a commit (Commet's own regex), how often
// the call record's `cwd` differs from the transcript's first cwd, and the key shape of
// `gitOperation`. Prints counts and key names only; commands are regex-tested, never printed.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { runsGitCommit } from '../../dist/attrib/parsers/claude.js';
const root = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
const DENIED_TYPE = /"type"\s*:\s*"(last-prompt|attachment|api-request[^"]*|file-history[^"]*)"/;
const since = Date.now() - 3 * 86_400_000;
const c = { gitCalls: 0, callCwdDiffersFromHead: 0, callCwdOutsideHeadTree: 0, gitOpShapes: new Map(), diffFilesUnderCwd: 0, diffFilesOutsideCwd: 0 };
const under = (p, r) => p === r || p.startsWith(r + '/');
for (const slug of readdirSync(root)) {
  let names; try { names = readdirSync(join(root, slug)); } catch { continue; }
  for (const n of names) {
    if (!n.endsWith('.jsonl')) continue;
    const f = join(root, slug, n);
    if (statSync(f).mtimeMs < since || statSync(f).size > 50 << 20) continue;
    let head = null;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line || DENIED_TYPE.test(line)) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      if (head === null && typeof r.cwd === 'string') head = r.cwd;
      const content = r?.message?.content;
      if (r.type === 'assistant' && Array.isArray(content)) {
        for (const u of content) {
          if (u?.type !== 'tool_use' || u.name !== 'Bash' || typeof u.input?.command !== 'string' || !runsGitCommit(u.input.command)) continue;
          c.gitCalls++;
          if (r.cwd !== head) c.callCwdDiffersFromHead++;
          if (!under(r.cwd, head)) c.callCwdOutsideHeadTree++;
        }
      }
      const res = r.toolUseResult;
      if (res && typeof res === 'object' && !Array.isArray(res)) {
        if (res.gitOperation && typeof res.gitOperation === 'object') {
          const shape = JSON.stringify(Object.fromEntries(Object.entries(res.gitOperation).map(([k, v]) => [k, v && typeof v === 'object' ? Object.keys(v).sort() : typeof v])));
          c.gitOpShapes.set(shape, (c.gitOpShapes.get(shape) ?? 0) + 1);
        }
        if (res.bashEditDiff && Array.isArray(res.bashEditDiff.files)) {
          for (const fl of res.bashEditDiff.files) {
            if (typeof fl?.filePath !== 'string') continue;
            if (under(fl.filePath, r.cwd)) c.diffFilesUnderCwd++; else c.diffFilesOutsideCwd++;
          }
        }
      }
    }
  }
}
console.log({ ...c, gitOpShapes: Object.fromEntries(c.gitOpShapes) });
