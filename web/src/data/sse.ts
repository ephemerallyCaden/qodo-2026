// A text/event-stream parser for GET /api/events, which the view reads with fetch (not EventSource)
// so the token travels in a header, never in a URL (contract). Chunks may split anywhere, including
// inside a line or a CRLF. Each event's data is one LiveEvent; anything else is counted, not used.
import type { LiveEvent } from '../../../src/core/contract/api.js';

const TYPES = ['snapshot', 'layout', 'fog'];
/** A runaway line (no newline for this long) is dropped rather than buffered forever. */
const MAX_LINE = 64 * 1024;

export class EventStreamParser {
  private buffer = '';
  private data: string[] = [];
  private skipLf = false;
  /** Events whose data wasn't a LiveEvent, and over-long lines. Shown, never silently dropped (Rule 1). */
  rejected = 0;

  /** Feeds a decoded chunk; returns the complete events it finished. */
  push(chunk: string): LiveEvent[] {
    const out: LiveEvent[] = [];
    let text = chunk;
    if (this.skipLf && text.startsWith('\n')) text = text.slice(1);
    this.skipLf = false;
    this.buffer += text;
    for (;;) {
      const i = this.buffer.search(/[\r\n]/);
      if (i < 0) break;
      const line = this.buffer.slice(0, i);
      const crlf = this.buffer[i] === '\r';
      this.buffer = this.buffer.slice(i + 1);
      if (crlf) {
        if (this.buffer.startsWith('\n')) this.buffer = this.buffer.slice(1);
        else if (this.buffer === '') this.skipLf = true; // the LF may come in the next chunk
      }
      const ev = this.line(line);
      if (ev) out.push(ev);
    }
    if (this.buffer.length > MAX_LINE) { this.buffer = ''; this.rejected++; }
    return out;
  }

  private line(line: string): LiveEvent | null {
    if (line === '') return this.dispatch();
    if (line.startsWith(':')) return null; // comment / keep-alive
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') this.data.push(value);
    return null;
  }

  private dispatch(): LiveEvent | null {
    if (this.data.length === 0) return null;
    const text = this.data.join('\n');
    this.data = [];
    const ev = parseLiveEvent(text);
    if (!ev) this.rejected++;
    return ev;
  }
}

/** A LiveEvent from one event's data, or null if it isn't one. */
export function parseLiveEvent(text: string): LiveEvent | null {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return null; }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o['type'] !== 'string' || !TYPES.includes(o['type']) || typeof o['head'] !== 'string') return null;
  return { type: o['type'] as LiveEvent['type'], head: o['head'] };
}
