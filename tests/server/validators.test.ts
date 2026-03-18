import { describe, it, expect } from 'vitest';
import { validateImageFormats } from '../../server/src/services/ai/media/validators';

describe('validateImageFormats', () => {
    // ─── Pass cases ───
    it('passes with empty array', () => { expect(() => validateImageFormats([])).not.toThrow(); });
    it('passes with whitespace-only entries (treated as empty)', () => { expect(() => validateImageFormats(['', '  '])).not.toThrow(); });
    it('passes with valid URLs', () => {
        expect(() => validateImageFormats(['https://example.com/a.jpg', 'http://example.com/b.png'])).not.toThrow();
    });
    it('passes with valid Base64 (same MIME)', () => {
        expect(() => validateImageFormats(['data:image/png;base64,iVBORw0KGgo=', 'data:image/png;base64,iVBORw0KGgo='])).not.toThrow();
    });

    // ─── Error cases ───
    it('throws on mixed URL + Base64', () => {
        expect(() => validateImageFormats(['https://example.com/a.jpg', 'data:image/png;base64,iVBORw0KGgo='])).toThrow('Mixed formats');
    });
    it('throws on inconsistent Base64 MIME types', () => {
        expect(() => validateImageFormats(['data:image/png;base64,iVBORw0KGgo=', 'data:image/jpeg;base64,/9j/4AAQ='])).toThrow('Inconsistent Base64');
    });
    it('throws on URLs mixed with invalid strings', () => {
        expect(() => validateImageFormats(['https://example.com/a.jpg', 'not-a-url'])).toThrow('Invalid URL format');
    });
    it('throws on Base64 mixed with invalid strings', () => {
        expect(() => validateImageFormats(['data:image/png;base64,iVBORw0KGgo=', 'random-garbage'])).toThrow('Invalid Base64');
    });
    it('throws on completely invalid format', () => {
        expect(() => validateImageFormats(['not-url-not-base64'])).toThrow('Invalid image format');
    });

    // ─── Edge cases ───
    it('passes single valid URL', () => { expect(() => validateImageFormats(['https://cdn.example.com/image.webp'])).not.toThrow(); });
    it('passes single valid Base64', () => { expect(() => validateImageFormats(['data:image/jpeg;base64,/9j/4AAQ='])).not.toThrow(); });
    it('ignores empty strings among valid URLs', () => {
        expect(() => validateImageFormats(['', 'https://example.com/a.jpg', '  '])).not.toThrow();
    });
});
