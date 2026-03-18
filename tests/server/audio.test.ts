import { describe, it, expect } from 'vitest';
import {
    base64ToArrayBuffer,
    arrayBufferToBase64,
    normalizeAudioVoice,
    pcmToWav,
    VOICE_OPTIONS,
} from '../../server/src/services/ai/media/audio';

// ════════════════════════════════════════════
// base64ToArrayBuffer
// ════════════════════════════════════════════
describe('base64ToArrayBuffer', () => {
    it('decodes to correct byte length', () => {
        // "AAAA" in base64 = 3 bytes of zeros
        const buf = base64ToArrayBuffer('AAAA');
        expect(buf.byteLength).toBe(3);
    });

    it('decodes known payload', () => {
        // 'SGVsbG8=' = "Hello"
        const buf = base64ToArrayBuffer('SGVsbG8=');
        const arr = new Uint8Array(buf);
        expect(String.fromCharCode(...arr)).toBe('Hello');
    });

    it('handles empty string', () => {
        expect(base64ToArrayBuffer('').byteLength).toBe(0);
    });
});

// ════════════════════════════════════════════
// arrayBufferToBase64
// ════════════════════════════════════════════
describe('arrayBufferToBase64', () => {
    it('round-trips correctly (encode → decode → compare)', () => {
        const original = 'SGVsbG8gV29ybGQ='; // "Hello World"
        const buf = base64ToArrayBuffer(original);
        const result = arrayBufferToBase64(buf);
        expect(result).toBe(original);
    });

    it('handles empty buffer', () => {
        expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('');
    });

    it('handles large buffer (> chunkSize 0x8000)', () => {
        const size = 0x10000; // 64KB
        const buf = new ArrayBuffer(size);
        const arr = new Uint8Array(buf);
        arr.fill(65); // 'A'
        const b64 = arrayBufferToBase64(buf);
        const decoded = base64ToArrayBuffer(b64);
        expect(decoded.byteLength).toBe(size);
    });
});

// ════════════════════════════════════════════
// normalizeAudioVoice
// ════════════════════════════════════════════
describe('normalizeAudioVoice', () => {
    // Direct OpenAI voice names pass through
    it('passes "alloy" through directly', () => expect(normalizeAudioVoice('alloy')).toBe('alloy'));
    it('passes "echo" through directly', () => expect(normalizeAudioVoice('echo')).toBe('echo'));
    it('passes "nova" through directly', () => expect(normalizeAudioVoice('nova')).toBe('nova'));
    it('passes "shimmer" through directly', () => expect(normalizeAudioVoice('shimmer')).toBe('shimmer'));
    it('is case-insensitive for direct names', () => expect(normalizeAudioVoice('ALLOY')).toBe('alloy'));

    // Gemini voice mapping
    it('maps Puck → onyx', () => expect(normalizeAudioVoice('Puck')).toBe('onyx'));
    it('maps Charon → echo', () => expect(normalizeAudioVoice('Charon')).toBe('echo'));
    it('maps Kore → nova', () => expect(normalizeAudioVoice('Kore')).toBe('nova'));
    it('maps Fenrir → onyx', () => expect(normalizeAudioVoice('Fenrir')).toBe('onyx'));
    it('maps Zephyr → alloy', () => expect(normalizeAudioVoice('Zephyr')).toBe('alloy'));
    it('maps Aoede → shimmer', () => expect(normalizeAudioVoice('Aoede')).toBe('shimmer'));

    // Edge cases
    it('defaults unknown name to alloy', () => expect(normalizeAudioVoice('UnknownVoice')).toBe('alloy'));
    it('defaults empty string to alloy', () => expect(normalizeAudioVoice('')).toBe('alloy'));
    it('trims whitespace', () => expect(normalizeAudioVoice('  Puck  ')).toBe('onyx'));
});

// ════════════════════════════════════════════
// pcmToWav
// ════════════════════════════════════════════
describe('pcmToWav', () => {
    it('produces a Blob with audio/wav MIME type', () => {
        const pcm = new ArrayBuffer(100);
        const wav = pcmToWav(pcm);
        expect(wav.type).toBe('audio/wav');
    });

    it('WAV header starts with RIFF magic bytes', async () => {
        const pcm = new ArrayBuffer(100);
        const wav = pcmToWav(pcm);
        const buf = await wav.arrayBuffer();
        const view = new DataView(buf);
        // "RIFF" = 0x52494646
        expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    });

    it('WAV header contains WAVE format', async () => {
        const pcm = new ArrayBuffer(100);
        const wav = pcmToWav(pcm);
        const buf = await wav.arrayBuffer();
        const view = new DataView(buf);
        expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE');
    });

    it('data chunk size equals pcmData byteLength', async () => {
        const pcm = new ArrayBuffer(200);
        const wav = pcmToWav(pcm);
        const buf = await wav.arrayBuffer();
        const view = new DataView(buf);
        // data chunk size at offset 40
        expect(view.getUint32(40, true)).toBe(200);
    });

    it('total blob size = 44 header + pcm data', async () => {
        const pcm = new ArrayBuffer(300);
        const wav = pcmToWav(pcm);
        expect(wav.size).toBe(344);
    });

    it('respects custom sampleRate', async () => {
        const pcm = new ArrayBuffer(100);
        const wav = pcmToWav(pcm, 48000);
        const buf = await wav.arrayBuffer();
        const view = new DataView(buf);
        expect(view.getUint32(24, true)).toBe(48000);
    });
});

// ════════════════════════════════════════════
// VOICE_OPTIONS constant
// ════════════════════════════════════════════
describe('VOICE_OPTIONS', () => {
    it('has 6 voices', () => expect(VOICE_OPTIONS).toHaveLength(6));
    it('each voice has id and name', () => {
        VOICE_OPTIONS.forEach(v => {
            expect(v.id).toBeTruthy();
            expect(v.name).toBeTruthy();
        });
    });
});
