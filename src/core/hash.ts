import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { SessionKey, Tool } from './snapshot/types.js';

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

/** First four bytes of sha256(text) as a big-endian uint32. */
export function u32(text: string): number {
  const d = sha256(utf8ToBytes(text));
  return ((d[0]! << 24) | (d[1]! << 16) | (d[2]! << 8) | d[3]!) >>> 0;
}

/** git-ai compatible: 's_' + sha256('<tool>:<sessionId>[:<agentId>]')[:14]. */
export function sessionKey(tool: Tool, sessionId: string, agentId?: string): SessionKey {
  const id = agentId === undefined ? `${tool}:${sessionId}` : `${tool}:${sessionId}:${agentId}`;
  return `s_${sha256Hex(id).slice(0, 14)}`;
}

/** Returns a memoised HMAC-SHA256(key, line)[:16] function. Hashes never enter the snapshot. */
export function lineHasher(key: Uint8Array): (line: string) => string {
  const keyed = hmac.create(sha256, key);
  const memo = new Map<string, string>();
  return (line) => {
    let h = memo.get(line);
    if (h === undefined) {
      h = bytesToHex(keyed.clone().update(utf8ToBytes(line)).digest().subarray(0, 8));
      memo.set(line, h);
    }
    return h;
  };
}
