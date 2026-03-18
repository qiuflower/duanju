import { describe, it, expect } from 'vitest';
import { extractImageFromResponse } from '../../server/src/services/ai/media/image';

describe('extractImageFromResponse', () => {
    // ─── Inline Base64 ───
    it('extracts inline base64 image data', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' }
                    }]
                }
            }]
        } as any;
        expect(extractImageFromResponse(response)).toBe('data:image/png;base64,iVBORw0KGgo=');
    });

    it('defaults mimeType to image/png when missing', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        inlineData: { data: 'abc123' }
                    }]
                }
            }]
        } as any;
        expect(extractImageFromResponse(response)).toBe('data:image/png;base64,abc123');
    });

    // ─── URL extraction from text ───
    it('extracts URL from markdown image syntax', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        text: '![alt text](https://storage.example.com/image.png)'
                    }]
                }
            }]
        } as any;
        expect(extractImageFromResponse(response)).toBe('https://storage.example.com/image.png');
    });

    it('extracts bare URL from text', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        text: 'Here is the image: https://example.com/img.jpg'
                    }]
                }
            }]
        } as any;
        expect(extractImageFromResponse(response)).toBe('https://example.com/img.jpg');
    });

    it('handles "! " prefix in text', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        text: '! https://example.com/image.png'
                    }]
                }
            }]
        } as any;
        expect(extractImageFromResponse(response)).toBe('https://example.com/image.png');
    });

    // ─── Error cases ───
    it('throws when no candidates', () => {
        expect(() => extractImageFromResponse({ candidates: [] } as any)).toThrow('No candidates');
    });

    it('throws when candidates is undefined', () => {
        expect(() => extractImageFromResponse({} as any)).toThrow('No candidates');
    });

    it('throws on text refusal (no URL in text)', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [{
                        text: 'I cannot generate this image due to policy.'
                    }]
                }
            }]
        } as any;
        expect(() => extractImageFromResponse(response)).toThrow('Model Refusal');
    });

    it('throws when no image data at all', () => {
        const response = {
            candidates: [{
                content: { parts: [] }
            }]
        } as any;
        expect(() => extractImageFromResponse(response)).toThrow('No image data');
    });

    // ─── Priority: inlineData over text ───
    it('prefers inlineData over text URL', () => {
        const response = {
            candidates: [{
                content: {
                    parts: [
                        { text: 'https://example.com/fallback.png' },
                        { inlineData: { mimeType: 'image/jpeg', data: '/9j/abc' } }
                    ]
                }
            }]
        } as any;
        expect(extractImageFromResponse(response)).toBe('data:image/jpeg;base64,/9j/abc');
    });
});
