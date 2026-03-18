import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../../src/services/ai/helpers';

describe('safeJsonParse', () => {
    const FALLBACK = { fallback: true };

    // ─── Clean JSON ───
    it('parses valid JSON object', () => {
        expect(safeJsonParse('{"a":1,"b":"hello"}', FALLBACK)).toEqual({ a: 1, b: 'hello' });
    });

    it('parses valid JSON array', () => {
        expect(safeJsonParse('[1,2,3]', FALLBACK)).toEqual([1, 2, 3]);
    });

    // ─── Markdown Fences ───
    it('handles ```json fences', () => {
        const input = '```json\n{"key":"value"}\n```';
        expect(safeJsonParse(input, FALLBACK)).toEqual({ key: 'value' });
    });

    it('handles ``` fences without language', () => {
        const input = '```\n{"key":"value"}\n```';
        expect(safeJsonParse(input, FALLBACK)).toEqual({ key: 'value' });
    });

    // ─── Trailing Commas ───
    it('fixes trailing comma in object', () => {
        expect(safeJsonParse('{"a":1,"b":2,}', FALLBACK)).toEqual({ a: 1, b: 2 });
    });

    it('fixes trailing comma in array', () => {
        expect(safeJsonParse('[1,2,3,]', FALLBACK)).toEqual([1, 2, 3]);
    });

    // ─── Text Before/After JSON ───
    it('extracts JSON from surrounding text', () => {
        expect(safeJsonParse('Here is the result: {"data": "hello"} end.', FALLBACK)).toEqual({ data: 'hello' });
    });

    it('extracts array from surrounding text', () => {
        expect(safeJsonParse('Output: [1, 2, 3] done.', FALLBACK)).toEqual([1, 2, 3]);
    });

    // ─── Truncated JSON ───
    it('handles truncated object (missing closing brace)', () => {
        expect(safeJsonParse('{"a":1,"b":"hello"', FALLBACK)).toEqual({ a: 1, b: 'hello' });
    });

    // ─── Nested structures ───
    it('parses nested JSON correctly', () => {
        expect(safeJsonParse('{"outer":{"inner":"value"}}', FALLBACK)).toEqual({ outer: { inner: 'value' } });
    });

    // ─── Edge cases ───
    it('returns fallback for undefined', () => { expect(safeJsonParse(undefined, FALLBACK)).toEqual(FALLBACK); });
    it('returns fallback for empty string', () => { expect(safeJsonParse('', FALLBACK)).toEqual(FALLBACK); });
    it('returns fallback for completely invalid text', () => { expect(safeJsonParse('this is not json at all', FALLBACK)).toEqual(FALLBACK); });
    it('returns fallback for whitespace only', () => { expect(safeJsonParse('   ', FALLBACK)).toEqual(FALLBACK); });

    // ─── Complex real-world scenarios ───
    it('handles markdown fence + trailing comma combined', () => {
        const input = '```json\n{"scenes": [{"id": 1,}, {"id": 2,}],}\n```';
        expect(safeJsonParse(input, FALLBACK)).toEqual({ scenes: [{ id: 1 }, { id: 2 }] });
    });

    it('handles strings with escaped quotes', () => {
        expect(safeJsonParse('{"prompt": "a \\"beautiful\\" scene"}', FALLBACK)).toEqual({ prompt: 'a "beautiful" scene' });
    });
});
