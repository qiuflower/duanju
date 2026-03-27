/**
 * Script Segmenter — 确定性剧本分段器
 * 
 * 利用 Agent1 输出的结构化标记，将剧本按规则拆分为原子片段。
 * 每个片段将 1:1 对应一个 beat，保证零信息损失。
 * 
 * 规则：
 *   --- HOOK / TWIST / CLIMAX / CLIFFHANGER ---  → transition (不生成 beat，仅作上下文)
 *   【场景：地点·时间】                            → scene_header
 *   角色名：（动作）"台词"                         → dialogue (每 2-3 轮合并)
 *   纯动作/环境描写段落                            → action (每 150-250 字切分)
 */

export interface ScriptSegment {
    index: number;
    type: 'scene_header' | 'dialogue' | 'action' | 'transition';
    raw_text: string;
    scene_context?: string;
    characters: string[];
    rhythm_marker?: string;
}

// --- Regex patterns ---
const RHYTHM_MARKER_RE = /^[-—─]{2,}\s*(.+?)\s*[-—─]{2,}$/;
const SCENE_HEADER_RE = /^(?:【[^】]*】|第\d+场[^\n]*)/;
const DIALOGUE_SINGLE_LINE_RE = /^(.{1,15})[：:]/;
const MIN_MERGE_CHARS = 30;
const MAX_ACTION_CHARS = 150;
const DIALOGUE_LINES_PER_SEGMENT = 2;

/**
 * 将 Agent1 生成的结构化剧本拆分为原子片段
 */
export function segmentScript(script: string): ScriptSegment[] {
    if (!script || !script.trim()) return [];

    let scriptBody = script;
    const scriptMarkerMatch = script.match(/\*\*Script\*\*\s*[:：]/i);
    if (scriptMarkerMatch && scriptMarkerMatch.index !== undefined) {
        scriptBody = script.slice(scriptMarkerMatch.index + scriptMarkerMatch[0].length);
    } else {
        const firstSceneOrRhythm = scriptBody.match(/(?:【[^】]*】|[-—─]{2,}\s*.+?\s*[-—─]{2,}|第\d+场)/);
        if (firstSceneOrRhythm && firstSceneOrRhythm.index !== undefined) {
            scriptBody = scriptBody.slice(firstSceneOrRhythm.index);
        }
    }

    // 按空行将剧本切分为多个段落区块 (Blocks)
    const rawBlocks = scriptBody.split(/\r?\n\s*\r?\n/).filter(b => b.trim());
    const segments: ScriptSegment[] = [];
    let currentScene = '';
    let dialogueBuffer: string[] = [];
    let dialogueChars: string[] = [];
    let segIndex = 0;

    const flushDialogue = () => {
        if (dialogueBuffer.length === 0) return;
        segments.push({
            index: segIndex++,
            type: 'dialogue',
            raw_text: dialogueBuffer.join('\n\n'),
            scene_context: currentScene,
            characters: [...new Set(dialogueChars)],
        });
        dialogueBuffer = [];
        dialogueChars = [];
    };

    for (const rawBlock of rawBlocks) {
        const block = rawBlock.trim();

        // 1. 节奏标记 (--- HOOK / TWIST / CLIMAX ---)
        const rhythmMatch = block.match(RHYTHM_MARKER_RE);
        if (rhythmMatch) {
            flushDialogue();
            segments.push({
                index: segIndex++,
                type: 'transition',
                raw_text: block,
                scene_context: currentScene,
                characters: [],
                rhythm_marker: rhythmMatch[1].trim(),
            });
            continue;
        }

        // 2. 场景标头 【场景：地点·时间】 或 第X场
        if (SCENE_HEADER_RE.test(block)) {
            flushDialogue();
            currentScene = block.split('\n')[0].trim();
            segments.push({
                index: segIndex++,
                type: 'scene_header',
                raw_text: block,
                scene_context: currentScene,
                characters: [],
            });
            continue;
        }

        // 3. 对话区块检测 (支持单行：角色名：台词，或多行：角色名\n动作\n台词)
        let isDialogue = false;
        let charName = '';

        const lines = block.split('\n').map(l => l.trim());
        const singleLineMatch = block.match(DIALOGUE_SINGLE_LINE_RE);

        if (singleLineMatch) {
            isDialogue = true;
            charName = singleLineMatch[1].trim();
        } else if (lines.length >= 2 && lines.length <= 5) {
            // 标准剧本格式：第一行通常是极短的角色名，且无逗号句号标点符号
            const firstLine = lines[0];
            if (firstLine.length >= 1 && firstLine.length <= 15 && !/[，。！？”“（）]/.test(firstLine)) {
                // 确保后面含有真正的台词（带有引号）或动作语气（带有括号）
                if (lines.some(l => l.startsWith('（') || l.startsWith('(') || l.includes('"') || l.includes('“') || l.includes('”'))) {
                    isDialogue = true;
                    charName = firstLine;
                }
            }
        }

        if (isDialogue) {
            dialogueBuffer.push(block);
            if (charName && !dialogueChars.includes(charName)) {
                dialogueChars.push(charName);
            }

            if (dialogueBuffer.length >= DIALOGUE_LINES_PER_SEGMENT) {
                flushDialogue();
            }
            continue;
        }

        // 4. 纯动作/环境描写
        flushDialogue();

        segments.push({
            index: segIndex++,
            type: 'action',
            raw_text: block,
            scene_context: currentScene,
            characters: [],
        });
    }

    flushDialogue();

    // 后处理：合并过短片段
    const structuralResult = mergeShortSegments(segments);

    return structuralResult;
}

/**
 * 按长度切块 — 最终 fallback
 * 在段落边界（空行/句号/换行）处切分，每块约 200 字
 */
function chunkByLength(text: string, chunkSize: number = 200): ScriptSegment[] {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    const segments: ScriptSegment[] = [];
    let buffer = '';
    let segIndex = 0;

    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        if (buffer.length + trimmed.length > chunkSize && buffer.length > 0) {
            segments.push({
                index: segIndex++,
                type: 'action',
                raw_text: buffer.trim(),
                characters: [],
            });
            buffer = trimmed;
        } else {
            buffer += (buffer ? '\n' : '') + trimmed;
        }
    }

    if (buffer.trim()) {
        segments.push({
            index: segIndex++,
            type: 'action',
            raw_text: buffer.trim(),
            characters: [],
        });
    }

    return segments;
}

/**
 * 合并过短的相邻片段（防止碎片化）
 * transition 和 scene_header 不参与合并
 */
function mergeShortSegments(segments: ScriptSegment[]): ScriptSegment[] {
    if (segments.length <= 1) return segments;

    const result: ScriptSegment[] = [];
    let i = 0;

    while (i < segments.length) {
        const seg = segments[i];

        // transition/scene_header 不合并
        if (seg.type === 'transition' || seg.type === 'scene_header') {
            result.push(seg);
            i++;
            continue;
        }

        // 如果当前片段过短，尝试与下一个同类型/可合并片段合并
        if (seg.raw_text.length < MIN_MERGE_CHARS && i + 1 < segments.length) {
            const next = segments[i + 1];
            if (next.type !== 'transition' && next.type !== 'scene_header') {
                // 合并
                result.push({
                    index: seg.index,
                    type: seg.type === 'dialogue' || next.type === 'dialogue' ? 'dialogue' : 'action',
                    raw_text: seg.raw_text + '\n' + next.raw_text,
                    scene_context: seg.scene_context || next.scene_context,
                    characters: [...new Set([...seg.characters, ...next.characters])],
                    rhythm_marker: seg.rhythm_marker || next.rhythm_marker,
                });
                i += 2;
                continue;
            }
        }

        result.push(seg);
        i++;
    }

    // 重新编号
    result.forEach((seg, idx) => { seg.index = idx; });
    return result;
}

/**
 * 将分段片段格式化为 Agent2 标注模式的 user message
 * transition 和 scene_header 片段不生成 beat，仅作为上下文标注
 */
export function formatSegmentsForAnnotation(segments: ScriptSegment[]): string {
    const lines: string[] = [];
    let beatIndex = 1;

    for (const seg of segments) {
        if (seg.type === 'transition' || seg.type === 'scene_header') {
            lines.push(`\n  ── ${seg.rhythm_marker || seg.raw_text.trim()} ──\n`);
        } else {
            const sid = `S${String(beatIndex).padStart(2, '0')}`;
            const chars = seg.characters.length > 0 ? ` [角色: ${seg.characters.join(', ')}]` : '';
            const sceneCtx = seg.scene_context ? ` [场景: ${seg.scene_context.trim()}]` : '';
            lines.push(`[${sid}] (${seg.type})${sceneCtx}${chars}\n${seg.raw_text}`);
            beatIndex++;
        }
    }

    return lines.join('\n\n');
}

/**
 * 统计需要生成 beat 的片段数量 (排除 transition 和 scene_header)
 */
export function countBeatSegments(segments: ScriptSegment[]): number {
    return segments.filter(s => s.type !== 'transition' && s.type !== 'scene_header').length;
}
