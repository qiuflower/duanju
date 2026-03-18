import { describe, it, expect } from 'vitest';
import {
    isHttpUrl, isBase64, parseDataUrl, base64ByteSize,
    guessImageMimeFromBase64, normalizeImageToDataUrl, findFirstHttpUrlDeep,
} from '../../server/src/services/ai/providers/t8star-utils';

describe('isHttpUrl', () => {
    it('matches https', () => expect(isHttpUrl('https://example.com')).toBe(true));
    it('matches http', () => expect(isHttpUrl('http://example.com')).toBe(true));
    it('rejects data URL', () => expect(isHttpUrl('data:image/png;base64,abc')).toBe(false));
    it('rejects random string', () => expect(isHttpUrl('hello')).toBe(false));
});

describe('isBase64', () => {
    it('matches valid data URL', () => expect(isBase64('data:image/png;base64,abc')).toBe(true));
    it('matches jpeg', () => expect(isBase64('data:image/jpeg;base64,/9j/')).toBe(true));
    it('rejects http URL', () => expect(isBase64('https://example.com')).toBe(false));
    it('rejects raw base64', () => expect(isBase64('iVBORw0KGgo')).toBe(false));
});

describe('parseDataUrl', () => {
    it('parses valid data URL', () => {
        expect(parseDataUrl('data:image/png;base64,iVBORw0KGgo=')).toEqual({ mimeType: 'image/png', base64: 'iVBORw0KGgo=' });
    });
    it('parses jpeg data URL', () => {
        expect(parseDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toEqual({ mimeType: 'image/jpeg', base64: '/9j/4AAQ' });
    });
    it('returns null for non data URL', () => { expect(parseDataUrl('https://example.com')).toBeNull(); });
    it('returns null for data URL without base64', () => { expect(parseDataUrl('data:text/plain,hello')).toBeNull(); });
});

describe('base64ByteSize', () => {
    it('estimates byte size correctly', () => { expect(base64ByteSize('AAAA')).toBe(3); });
    it('handles longer string', () => { expect(base64ByteSize('AAAAAAAA')).toBe(6); });
    it('handles empty string', () => { expect(base64ByteSize('')).toBe(0); });
});

describe('guessImageMimeFromBase64', () => {
    it('detects JPEG', () => { expect(guessImageMimeFromBase64('/9j/4AAQSkZJ')).toBe('image/jpeg'); });
    it('detects PNG', () => { expect(guessImageMimeFromBase64('iVBORw0KGgoAAAAN')).toBe('image/png'); });
    it('detects GIF', () => { expect(guessImageMimeFromBase64('R0lGODlhAQABAIAA')).toBe('image/gif'); });
    it('detects WebP', () => { expect(guessImageMimeFromBase64('UklGRhIAAABXRUJQ')).toBe('image/webp'); });
    it('detects BMP', () => { expect(guessImageMimeFromBase64('QkAAAAAAAA')).toBe('image/bmp'); });
    it('defaults to png for unknown', () => { expect(guessImageMimeFromBase64('AAAABBBB')).toBe('image/png'); });
    it('defaults to png for empty string', () => { expect(guessImageMimeFromBase64('')).toBe('image/png'); });
});

describe('normalizeImageToDataUrl', () => {
    it('returns data URL as-is', () => { expect(normalizeImageToDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo='); });
    it('returns HTTP URL as-is', () => { expect(normalizeImageToDataUrl('https://example.com/img.png')).toBe('https://example.com/img.png'); });
    it('wraps raw JPEG base64', () => { expect(normalizeImageToDataUrl('/9j/4AAQ')).toBe('data:image/jpeg;base64,/9j/4AAQ'); });
    it('wraps raw PNG base64', () => { expect(normalizeImageToDataUrl('iVBORw0KGgoAAAAN')).toBe('data:image/png;base64,iVBORw0KGgoAAAAN'); });
    it('returns empty for empty input', () => { expect(normalizeImageToDataUrl('')).toBe(''); });
});

describe('findFirstHttpUrlDeep', () => {
    it('finds URL in flat string', () => { expect(findFirstHttpUrlDeep('https://example.com')).toBe('https://example.com'); });
    it('finds URL in nested object', () => { expect(findFirstHttpUrlDeep({ a: { b: { url: 'https://deep.com/img.png' } } })).toBe('https://deep.com/img.png'); });
    it('finds URL in array', () => { expect(findFirstHttpUrlDeep([null, ['https://arr.com/x.jpg']])).toBe('https://arr.com/x.jpg'); });
    it('returns null when no URL', () => { expect(findFirstHttpUrlDeep({ a: 'not-url', b: 42 })).toBeNull(); });
    it('returns null for primitives', () => {
        expect(findFirstHttpUrlDeep(123)).toBeNull();
        expect(findFirstHttpUrlDeep(null)).toBeNull();
        expect(findFirstHttpUrlDeep(undefined)).toBeNull();
    });
    it('handles circular reference safely', () => {
        const obj: any = { a: 'hello' };
        obj.self = obj;
        expect(findFirstHttpUrlDeep(obj)).toBeNull();
    });
});
