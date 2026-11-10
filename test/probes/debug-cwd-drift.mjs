/* global process, console */
// Probe (privacy-safe): per transcript, how many distinct `cwd` values its records carry, and
// whether Bash tool results ever carry `bashEditDiff`. Prints counts and key names only: no
// paths, prompts, commands or output. Skips denied record types before JSON.parse, like Commet.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const root = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
const DENIED_TYPE = /"type"\s*:\s*"(last-prompt|attachment|api-request[^"]*|file-history[^"]*)"/;
const since = Date.now() - 3 * 86_400_000;
let files = 0, drifting = 0, bashResults = 0, bashWithDiff = 0, cwdChangeAfterBash = 0;
const resultKeys = new Map();
for (const slug of readdirSync(root)) {
  let names; try { names = readdirSync(join(root, slug)); } catch { continue; }
  for (const n of names) {
    if (!n.endsWith('.jsonl')) continue;
    const f = join(root, slug, n);
    if (statSync(f).mtimeMs < since || statSync(f).size > 50 << 20) continue;
    files++;
    const cwds = new Set();
    const bashIds = new Set();
    let prevCwd = null;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line || DENIED_TYPE.test(line)) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      if (typeof r.cwd === 'string') {
        if (prevCwd !== null && r.cwd !== prevCwd && r.type === 'user' && r.toolUseResult && bashIds.size) cwdChangeAfterBash++;
        cwds.add(r.cwd); prevCwd = r.cwd;
      }
      const content = r?.message?.content;
      if (r.type === 'assistant' && Array.isArray(content)) for (const c of content) if (c?.type === 'tool_use' && c.name === 'Bash') bashIds.add(c.id);
      if (r.type === 'user' && Array.isArray(content) && r.toolUseResult && typeof r.toolUseResult === 'object') {
        const id = content.find((c) => c?.type === 'tool_result')?.tool_use_id;
        if (bashIds.has(id)) {
          bashResults++;
          if ('bashEditDiff' in r.toolUseResult) bashWithDiff++;
          for (const k of Object.keys(r.toolUseResult)) resultKeys.set(k, (resultKeys.get(k) ?? 0) + 1);
        }
      }
    }
    if (cwds.size > 1) drifting++;
  }
}
console.log({ files, transcriptsWithMoreThanOneCwd: drifting, bashResults, bashResultsWithBashEditDiff: bashWithDiff, cwdChangesOnBashResults: cwdChangeAfterBash });
console.log('Bash toolUseResult keys:', Object.fromEntries([...resultKeys].sort((a, b) => b[1] - a[1])));
