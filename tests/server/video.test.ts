import { describe, it, expect } from 'vitest';
import { matchAssetsToPrompt, constructVideoPrompt } from '../../server/src/services/ai/media/video';
import { Asset, Scene, GlobalStyle } from '../../server/src/shared/types';

// ─── Fixtures ───
const ASSETS: Asset[] = [
    { id: 'hero', name: '岑矜', description: 'tall man with dark hair', type: 'character', refImageUrl: 'data:image/png;base64,hero' } as any,
    { id: 'heroine', name: '沈璃', description: 'woman in red dress', type: 'character', refImageUrl: 'data:image/png;base64,heroine' } as any,
    { id: 'scene_hall', name: '大殿', description: 'grand hall gold pillars', type: 'scene', refImageUrl: 'data:image/png;base64,hall' } as any,
    { id: 'no_image', name: '无图角色', description: 'no ref image', type: 'character' } as any,
];

const baseScene = (overrides: Partial<Scene> = {}): Scene => ({
    id: 'S01',
    visual_desc: '岑矜走进大殿',
    ...overrides,
} as Scene);

// ════════════════════════════════════════════
// matchAssetsToPrompt
// ════════════════════════════════════════════
describe('matchAssetsToPrompt', () => {
    it('scores +100 for explicitly listed asset IDs', () => {
        expect(matchAssetsToPrompt('random text', ASSETS, ['hero'])[0].id).toBe('hero');
    });
    it('scores +50 for name match in prompt', () => {
        const ids = matchAssetsToPrompt('岑矜走进大殿', ASSETS).map(a => a.id);
        expect(ids).toContain('hero');
        expect(ids).toContain('scene_hall');
    });
    it('filters out assets without refImageUrl', () => {
        expect(matchAssetsToPrompt('无图角色 appears', ASSETS).map(a => a.id)).not.toContain('no_image');
    });
    it('returns empty when nothing matches', () => {
        expect(matchAssetsToPrompt('completely unrelated text', ASSETS)).toHaveLength(0);
    });
    it('sorts by score descending (explicit ID > name match)', () => {
        expect(matchAssetsToPrompt('岑矜 和 沈璃', ASSETS, ['heroine'])[0].id).toBe('heroine');
    });
    it('scores token overlap from description', () => {
        const result = matchAssetsToPrompt('dark hair man walks', ASSETS);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result[0].id).toBe('hero');
    });
});

// ════════════════════════════════════════════
// constructVideoPrompt
// ════════════════════════════════════════════
describe('constructVideoPrompt', () => {
    it('uses video_prompt when available', () => {
        expect(constructVideoPrompt(baseScene({ video_prompt: 'A cinematic shot of the hall' }))).toBe('A cinematic shot of the hall');
    });
    it('falls back to visual_desc when no video_prompt', () => {
        expect(constructVideoPrompt(baseScene({ video_prompt: undefined }))).toBe('岑矜走进大殿');
    });
    it('prepends style prefix when not already present', () => {
        const scene = baseScene({ video_prompt: 'A shot of a hall' });
        const style: GlobalStyle = { visualTags: '[Anime][Fantasy]' } as any;
        expect(constructVideoPrompt(scene, style).startsWith('[Anime][Fantasy]. A shot')).toBe(true);
    });
    it('does NOT double-prepend style prefix', () => {
        const scene = baseScene({ video_prompt: '[Anime][Fantasy]. A shot' });
        const style: GlobalStyle = { visualTags: '[Anime][Fantasy]' } as any;
        expect(constructVideoPrompt(scene, style)).toBe('[Anime][Fantasy]. A shot');
    });
    it('appends audio dialogue', () => {
        const result = constructVideoPrompt(baseScene({ video_prompt: 'A scene', audio_dialogue: [{ speaker: '岑矜', text: '你好' }] }));
        expect(result).toContain('Character Dialogue');
        expect(result).toContain('岑矜: 你好');
    });
    it('appends sound effects', () => {
        expect(constructVideoPrompt(baseScene({ video_prompt: 'A scene', audio_sfx: 'sword clash' }))).toContain('Sound Effect: sword clash');
    });
    it('appends background music', () => {
        expect(constructVideoPrompt(baseScene({ video_prompt: 'A scene', audio_bgm: 'epic orchestral' }))).toContain('Background Music: epic orchestral');
    });
    it('adds proper separator based on trailing punctuation', () => {
        const result1 = constructVideoPrompt(baseScene({ video_prompt: 'Ends with period.', audio_sfx: 'boom' }));
        expect(result1).toContain('. Sound Effect');
        expect(result1).not.toContain('.. ');

        const result2 = constructVideoPrompt(baseScene({ video_prompt: 'No trailing punctuation', audio_sfx: 'boom' }));
        expect(result2).toContain('punctuation. Sound Effect');
    });
    it('handles empty scene gracefully', () => {
        expect(constructVideoPrompt(baseScene({ video_prompt: undefined, visual_desc: '' }))).toBe('');
    });
});
