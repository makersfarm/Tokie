import { describe, it, expect } from 'vitest';
import { mergeCursor } from './cursor';
import type { CursorRecord } from '../types';

describe('mergeCursor', () => {
  it('merges new fields into existing', () => {
    const prev: CursorRecord = { messageId: 'm1' };
    const next = mergeCursor(prev, { requestId: 'r1' });
    expect(next).toEqual({ messageId: 'm1', requestId: 'r1' });
  });
  it('overwrites file/offset when both present', () => {
    const prev: CursorRecord = { file: '/a.jsonl', lineOffset: 10 };
    const next = mergeCursor(prev, { file: '/b.jsonl', lineOffset: 0 });
    expect(next).toEqual({ file: '/b.jsonl', lineOffset: 0 });
  });
});
