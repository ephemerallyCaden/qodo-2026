import { createHash } from 'node:crypto';

export interface Ticket {
  number: number;
  title: string;
  body: string;
  url: string;
  author: string;
}

/**
 * The criteria under a `## Acceptance criteria` heading (any level, optional colon), one per
 * list item. A text line right after an item continues it; a blank line, sub-heading or code
 * fence ends it, and fenced lines are never items. Null when there is no such heading; an empty
 * array when the section holds no list items (R3 refuses both).
 */
export function acceptanceCriteria(body: string): string[] | null {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^\s{0,3}#{1,6}\s+acceptance criteria\s*:?\s*#*\s*$/i.test(l));
  if (start < 0) return null;
  const level = /^\s*(#+)/.exec(lines[start]!)![1]!.length;
  const items: string[] = [];
  let fenced = false;
  // True while the previous line was an item or its continuation.
  let open = false;
  for (const line of lines.slice(start + 1)) {
    const fence = /^\s{0,3}(```|~~~)/.test(line);
    if (fence) fenced = !fenced;
    if (fence || fenced) {
      open = false;
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s/.exec(line);
    if (heading && heading[1]!.length <= level) break;
    const item = /^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s+)?(.*\S)\s*$/.exec(line);
    if (item) items.push(item[1]!);
    else if (!heading && line.trim() && open) items[items.length - 1] += ' ' + line.trim();
    open = !!item || (open && !heading && !!line.trim());
  }
  return items;
}

/** `Scan: windowCommits splits numstat` → `scan-windowcommits-splits-numstat`, at most 40 chars. */
export function slugify(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length <= 40) return slug || 'ticket';
  const cut = slug.slice(0, 41);
  const at = cut.lastIndexOf('-');
  return (at > 10 ? cut.slice(0, at) : slug.slice(0, 40)).replace(/-+$/, '');
}

/** The branch a run on this ticket uses (with `-2`, `-3`… if taken). */
export const branchStem = (t: Pick<Ticket, 'number' | 'title'>) => `agent/${t.number}-${slugify(t.title)}`;

/** The ticket as the agent sees it, and as the run keeps it. */
export const ticketMarkdown = (t: Pick<Ticket, 'title' | 'body'>) => `# ${t.title}\n\n${t.body}\n`;

/** Fingerprint of the text the agent works from; any edit to the issue changes it (R12). */
export function ticketHash(title: string, body: string): string {
  return createHash('sha256').update(title).update('\0').update(body).digest('hex');
}

/** One markdown table cell: no pipes or newlines can break the row. */
export function cell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim() || '—';
}
