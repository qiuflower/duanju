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
const MIN_MERGE_CHARS = 20; // Reduced to allow shorter punchy beats
const MAX_ACTION_CHARS = 100; // More granular action shots
const DIALOGUE_LINES_PER_SEGMENT = 1; // 一人一拍 principle

/**
 * 将 Agent1 生成的结构化剧本拆分为原子片段 (Atomic Splitting)
 */
export function segmentScript(script: string): ScriptSegment[] {
    if (!script || !script.trim()) return [];

    let scriptBody = script;
    const scriptMarkerMatch = script.match(/\*\*Script\*\*\s*[:：]/i);
    if (scriptMarkerMatch && scriptMarkerMatch.index !== undefined) {
        scriptBody = script.slice(scriptMarkerMatch.index + scriptMarkerMatch[0].length);
    }

    // 1. 将全文按行拆分，过滤掉空白行
    const rawLines = scriptBody.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    const segments: ScriptSegment[] = [];
    let currentScene = '';
    let segIndex = 0;

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];

        // 2. 节奏标记 (--- HOOK ---)
        const rhythmMatch = line.match(RHYTHM_MARKER_RE);
        if (rhythmMatch) {
            segments.push({
                index: segIndex++,
                type: 'transition',
                raw_text: line,
                scene_context: currentScene,
                characters: [],
                rhythm_marker: rhythmMatch[1].trim(),
            });
            continue;
        }

        // 3. 场景标头 (第1场 ...) -> 强制独立
        if (SCENE_HEADER_RE.test(line)) {
            currentScene = line;
            segments.push({
                index: segIndex++,
                type: 'scene_header',
                raw_text: line,
                scene_context: currentScene,
                characters: [],
            });
            continue;
        }

        // 4. 对话行 (穆医生：...) -> 强制独立
        const dialogueMatch = line.match(DIALOGUE_SINGLE_LINE_RE);
        if (dialogueMatch) {
            const charName = dialogueMatch[1].trim();
            segments.push({
                index: segIndex++,
                type: 'dialogue',
                raw_text: line,
                scene_context: currentScene,
                characters: [charName],
            });
            continue;
        }

        // 5. 动作/环境描写 (括号内或纯文本)
        // 如果一行内有多个动作重点（由句号隔开），且长度较大，尝试再次切分
        const sentences = line.match(/[^。！？.!?\n]+[。！？.!?\n]?/g) || [line];
        let buffer = '';
        
        for (const sentence of sentences) {
            // 如果单句就很长，或者 buffer 加上新句后超长，就切开
            if (buffer.length + sentence.length > MAX_ACTION_CHARS && buffer.length > 0) {
                segments.push({
                    index: segIndex++,
                    type: 'action',
                    raw_text: buffer.trim(),
                    scene_context: currentScene,
                    characters: [],
                });
                buffer = sentence;
            } else {
                buffer += sentence;
            }
        }

        if (buffer.trim()) {
            segments.push({
                index: segIndex++,
                type: 'action',
                raw_text: buffer.trim(),
                scene_context: currentScene,
                characters: [],
            });
        }
    }

    // 后处理：合并过短片段 (如小于 10 个字符且不是标题的片段，可以适当合并到下一个)
    return mergeShortSegments(segments);
}

/**
 * 按长度切块 — 最终 fallback
 * 在段落边界（空行/句号/换行）处切分，每块约 200 字
 */
function chunkByLength(text: string, chunkSize: number = 120): ScriptSegment[] {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    const segments: ScriptSegment[] = [];
    let segIndex = 0;

    for (const para of paragraphs) {
        const trimmedPara = para.trim();
        if (!trimmedPara) continue;

        if (trimmedPara.length > chunkSize) {
            // Force split long dense paragraphs by Chinese sentence delimiters
            const sentences = trimmedPara.match(/[^。！？.!?\n]+[。！？.!?\n]?/g) || [trimmedPara];
            let currentBuffer = '';
            for (const sentence of sentences) {
                if (currentBuffer.length + sentence.length > chunkSize && currentBuffer.length > 0) {
                    segments.push({ index: segIndex++, type: 'action', raw_text: currentBuffer.trim(), characters: [] });
                    currentBuffer = sentence;
                } else {
                    currentBuffer += sentence;
                }
            }
            if (currentBuffer.trim()) {
                segments.push({ index: segIndex++, type: 'action', raw_text: currentBuffer.trim(), characters: [] });
            }
        } else {
            segments.push({ index: segIndex++, type: 'action', raw_text: trimmedPara, characters: [] });
        }
    }

    return segments;
}

/**
 * 全局后处理：强制切分所有超长的片段（对白、动作均适用）
 */
function splitLongSegments(segments: ScriptSegment[], maxLength: number = 120): ScriptSegment[] {
    const result: ScriptSegment[] = [];
    let segIndex = 0;

    for (const seg of segments) {
        if (seg.type === 'transition' || seg.type === 'scene_header') {
            seg.index = segIndex++;
            result.push(seg);
            continue;
        }

        if (seg.raw_text.length > maxLength) {
            // 利用中文句号、问号、叹号或换行特征强制物理切分
            const sentences = seg.raw_text.match(/[^。！？.!?\n]+[。！？.!?\n]?/g) || [seg.raw_text];
            let currentBuffer = '';
            for (const sentence of sentences) {
                if (currentBuffer.length + sentence.length > maxLength && currentBuffer.length > 0) {
                    result.push({
                        ...seg,
                        index: segIndex++,
                        raw_text: currentBuffer.trim(),
                    });
                    currentBuffer = sentence;
                } else {
                    currentBuffer += sentence;
                }
            }
            if (currentBuffer.trim()) {
                result.push({
                    ...seg,
                    index: segIndex++,
                    raw_text: currentBuffer.trim(),
                });
            }
        } else {
            seg.index = segIndex++;
            result.push(seg);
        }
    }

    return result;
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

        // transition/scene_header/dialogue 不参与合并，强制保持独立
        if (seg.type === 'transition' || seg.type === 'scene_header' || seg.type === 'dialogue') {
            result.push(seg);
            i++;
            continue;
        }

        // 如果当前片段过短，尝试与下一个同类型/可合并片段合并
        if (seg.raw_text.length < MIN_MERGE_CHARS && i + 1 < segments.length) {
            const next = segments[i + 1];
            // 防止合并后超过切分上限（120字），否则等于白拆了
            if (next.type !== 'transition' && next.type !== 'scene_header'
                && seg.raw_text.length + next.raw_text.length <= 120) {
                // 合并
                result.push({
                    index: seg.index,
                    type: 'action',
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
        if (seg.type === 'transition') {
            lines.push(`\n  ── ${seg.rhythm_marker || seg.raw_text.trim()} ──\n`);
        } else {
            const sid = `S${String(beatIndex).padStart(2, '0')}`;
            const typeLabel = seg.type === 'scene_header' ? 'ESTABLISHING' : seg.type;
            const chars = seg.characters.length > 0 ? ` [角色: ${seg.characters.join(', ')}]` : '';
            const sceneCtx = seg.scene_context ? ` [场景: ${seg.scene_context.trim()}]` : '';
            lines.push(`[${sid}] (${typeLabel})${sceneCtx}${chars}\n${seg.raw_text}`);
            beatIndex++;
        }
    }

    return lines.join('\n\n');
}

/**
 * 统计需要生成 beat 的片段数量 (排除 transition 和 scene_header)
 */
export function countBeatSegments(segments: ScriptSegment[]): number {
    return segments.filter(s => s.type !== 'transition').length;
}
