import { retryWithBackoff, ai } from "../helpers";
import { MODELS } from "../model-manager";

// --- AUDIO / TTS HELPERS ---

// Known Voices for Gemini TTS
export const VOICE_OPTIONS = [
    { id: "Puck", name: "Puck (Male, Low)" },
    { id: "Charon", name: "Charon (Male, Deep)" },
    { id: "Kore", name: "Kore (Female, Soft)" },
    { id: "Fenrir", name: "Fenrir (Male, Intense)" },
    { id: "Zephyr", name: "Zephyr (Female, Calm)" },
    { id: "Aoede", name: "Aoede (Female, Elegant)" }
];

export function base64ToArrayBuffer(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, bytes.length);
        let chunk = "";
        for (let j = i; j < end; j++) chunk += String.fromCharCode(bytes[j]);
        binary += chunk;
    }
    return btoa(binary);
}

export function normalizeAudioVoice(voiceName: string) {
    const v = (voiceName || "").trim();
    const lower = v.toLowerCase();
    if (
        lower === "alloy" ||
        lower === "echo" ||
        lower === "fable" ||
        lower === "onyx" ||
        lower === "nova" ||
        lower === "shimmer"
    ) {
        return lower;
    }

    const mapping: Record<string, string> = {
        Puck: "onyx",
        Charon: "echo",
        Kore: "nova",
        Fenrir: "onyx",
        Zephyr: "alloy",
        Aoede: "shimmer",
    };

    return mapping[v] || "alloy";
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

export const pcmToWav = (pcmData: ArrayBuffer, sampleRate: number = 24000, numChannels: number = 1): Blob => {
    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + pcmData.byteLength, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sampleRate * blockAlign)
    view.setUint32(28, sampleRate * numChannels * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, numChannels * 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, pcmData.byteLength, true);

    // Write PCM data
    const pcmBytes = new Uint8Array(pcmData);
    const wavBytes = new Uint8Array(buffer, 44);
    wavBytes.set(pcmBytes);

    return new Blob([buffer], { type: 'audio/wav' });
};

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
    if (!text.trim()) return "";
    const body = {
        model: MODELS.TTS,
        input: text,
        voice: normalizeAudioVoice(voiceName),
        response_format: "pcm",
    };
    const audioBuffer = await retryWithBackoff<ArrayBuffer>(() => ai.audio.speech(body));
    return arrayBufferToBase64(audioBuffer);
};
