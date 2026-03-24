import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Asset } from '@/shared/types';
import { ASSET_TAG_REGEX, extractAssetTags, resolveTagToAsset, isStoryboardTag } from '@/shared/asset-tags';

interface SceneImageCandidate {
    id: string;
    name: string;
    refImageUrl?: string;
}

interface MentionTextareaProps {
    value: string;
    onChange: (value: string) => void;
    assets: Asset[];
    sceneImages?: SceneImageCandidate[];
    referencedAssetIds: string[];
    onMention: (assetId: string) => void;
    onUnmention: (assetId: string) => void;

    maxMentions?: number;
    mode?: 'video' | 'image';
    className?: string;
    placeholder?: string;
}

// Regex for matching @图像_ tags — uses the shared unified regex
const TAG_REGEX = ASSET_TAG_REGEX;

// Extract all @图像_ tag names from text (excluding 分镜 tags)
const extractTags = (text: string): string[] => {
    return extractAssetTags(text).map(t => t.name).filter(n => !isStoryboardTag(n));
};

// Find asset info (display name + thumbnail) for a tag
// Uses ID anchor for exact lookup, falls back to name-based matching
const findAssetInfo = (
    tagName: string,
    assets: Asset[],
    sceneImages: SceneImageCandidate[],
    tagId?: string
): { displayName: string; thumb?: string } => {
    // 0. If #id anchor is present, exact ID lookup
    if (tagId) {
        const byId = assets.find(a => a.id === tagId);
        if (byId) return { displayName: byId.name, thumb: byId.refImageUrl };
        const siById = sceneImages.find(s => s.id === tagId);
        if (siById) return { displayName: siById.name, thumb: siById.refImageUrl };
    }

    // 1. Exact name match
    const exactAsset = assets.find(a => a.name === tagName || a.id === tagName);
    if (exactAsset) return { displayName: exactAsset.name, thumb: exactAsset.refImageUrl };
    const exactSi = sceneImages.find(s => s.name === tagName || s.id === tagName);
    if (exactSi) return { displayName: exactSi.name, thumb: exactSi.refImageUrl };

    // 1.5 Storyboard suffix matching: @图像_分镜S01 should match sceneImage named 分镜E1_S01
    if (isStoryboardTag(tagName)) {
        const beatSuffix = tagName.replace('分镜', ''); // "S01" or "E1_S01"
        const suffixMatch = sceneImages.find(s => {
            const siSuffix = s.name.replace('分镜', '');
            return siSuffix === beatSuffix || siSuffix.endsWith(`_${beatSuffix}`);
        });
        if (suffixMatch) return { displayName: suffixMatch.name, thumb: suffixMatch.refImageUrl };
    }

    // 2. Longest prefix-match fallback with overlap ratio gate (≥50%)
    const allCandidates = [...assets, ...sceneImages];
    let best: { displayName: string; thumb?: string } | null = null;
    let bestLen = 0;
    for (const c of allCandidates) {
        if (c.name.length >= 2 && (c.name.startsWith(tagName) || tagName.startsWith(c.name))) {
            const overlap = Math.min(c.name.length, tagName.length) / Math.max(c.name.length, tagName.length);
            if (overlap >= 0.5 && c.name.length > bestLen) {
                bestLen = c.name.length;
                best = { displayName: c.name, thumb: 'refImageUrl' in c ? c.refImageUrl : undefined };
            }
        }
    }
    if (best) return best;

    return { displayName: tagName };
};

// Color schemes per mode
const CHIP_COLORS = {
    video: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },  // blue
    image: { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#c084fc' },  // purple
};

// Convert plain text to HTML with mention chips
const textToHtml = (
    text: string,
    assets: Asset[],
    sceneImages: SceneImageCandidate[],
    mode: 'video' | 'image' = 'video'
): string => {
    if (!text) return '';
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return escaped.replace(
        TAG_REGEX,
        (_match, tagName: string, tagId: string | undefined) => {
            const info = findAssetInfo(tagName, assets, sceneImages, tagId);
            const colors = CHIP_COLORS[mode];
            const imgHtml = info.thumb
                ? `<img src="${info.thumb}" style="width:16px;height:16px;border-radius:2px;object-fit:cover;vertical-align:middle;margin-right:3px;display:inline-block;" />`
                : `<span style="margin-right:3px;">🧑</span>`;
            // Store both name and optional id in data attributes
            const idAttr = tagId ? ` data-mention-id="${tagId}"` : '';
            return `<span contenteditable="false" data-mention="${tagName}"${idAttr} style="display:inline-flex;align-items:center;gap:1px;background:${colors.bg};border:1px solid ${colors.border};border-radius:4px;padding:1px 5px;margin:0 1px;font-size:11px;color:${colors.text};cursor:default;vertical-align:middle;line-height:1.6;user-select:all;font-weight:500;">${imgHtml}${info.displayName}</span>\u00A0`;
        }
    );
};

// Extract plain text from contentEditable DOM
const htmlToText = (el: HTMLDivElement): string => {
    let result = '';
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const elem = node as HTMLElement;
            // Mention chip → convert back to @图像_xxx or @图像_xxx#id
            if (elem.dataset.mention) {
                const mentionId = elem.dataset.mentionId; // data-mention-id
                result += mentionId
                    ? `[@图像_${elem.dataset.mention}#${mentionId}]`
                    : `[@图像_${elem.dataset.mention}]`;
                return; // don't recurse into chip children
            }
            // <br> → newline
            if (elem.tagName === 'BR') {
                result += '\n';
                return;
            }
            // <div> blocks (contentEditable inserts divs for newlines)
            if (elem.tagName === 'DIV' && result.length > 0 && !result.endsWith('\n')) {
                result += '\n';
            }
            for (const child of Array.from(node.childNodes)) {
                walk(child);
            }
        }
    };
    for (const child of Array.from(el.childNodes)) {
        walk(child);
    }
    return result;
};

const MentionTextarea: React.FC<MentionTextareaProps> = ({
    value,
    onChange,
    assets,
    sceneImages = [],
    referencedAssetIds,
    onMention,
    onUnmention,

    maxMentions,
    mode = 'video',
    className = '',
    placeholder,
}) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const [query, setQuery] = useState('');
    const [highlightIdx, setHighlightIdx] = useState(0);
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

    const editorRef = useRef<HTMLDivElement>(null);
    const prevTagsRef = useRef<string[]>(extractTags(value));
    const dropdownRef = useRef<HTMLDivElement>(null);
    const lastRenderedValue = useRef<string>(value);
    const isInternalChange = useRef(false);

    const availableAssets = assets.filter(a => !!a.refImageUrl);

    // Sync prevTagsRef on external value changes
    useEffect(() => {
        prevTagsRef.current = extractTags(value);
    }, [value]);

    // Render HTML when value or sceneImages changes externally
    const sceneImagesFingerprint = sceneImages.map(s => `${s.name}:${s.refImageUrl ? '1' : '0'}`).join(',');
    const lastSceneImagesFPRef = useRef(sceneImagesFingerprint);
    useEffect(() => {
        if (!editorRef.current) return;
        if (isInternalChange.current) {
            isInternalChange.current = false;
            return;
        }
        const fpChanged = sceneImagesFingerprint !== lastSceneImagesFPRef.current;
        lastSceneImagesFPRef.current = sceneImagesFingerprint;
        if (value !== lastRenderedValue.current || fpChanged) {
            const html = textToHtml(value, assets, sceneImages, mode as 'video' | 'image');
            editorRef.current.innerHTML = html || '';
            lastRenderedValue.current = value;
        }
    }, [value, assets, sceneImagesFingerprint, mode]);

    // Initial render
    useEffect(() => {
        if (editorRef.current && !editorRef.current.innerHTML) {
            editorRef.current.innerHTML = textToHtml(value, assets, sceneImages, mode as 'video' | 'image') || '';
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Build candidate list
    const candidates = React.useMemo(() => {
        const items: { id: string; name: string; displayName: string; disabled: boolean; inPrompt: boolean; thumb?: string }[] = [];

        // Count ALL unique @图像 tags in prompt (including 分镜 tags)
        const currentTagMatches = [...value.matchAll(TAG_REGEX)];
        const promptIdSet = new Set<string>();
        const promptNameSet = new Set<string>();
        const uniqueRefs = new Set<string>();
        for (const m of currentTagMatches) {
            const tagName = m[1];
            const tagId = m[2]; // #id anchor
            if (tagId) promptIdSet.add(tagId);
            promptNameSet.add(tagName);
            // Use #id as unique key when available, otherwise name (avoids double-counting)
            uniqueRefs.add(tagId || tagName);
        }
        const currentMentionCount = uniqueRefs.size;
        const atLimit = maxMentions !== undefined && currentMentionCount >= maxMentions;

        for (const asset of availableAssets) {
            // Match by ID first (exact), then by name (fuzzy fallback)
            const isInPrompt = promptIdSet.has(asset.id) || promptNameSet.has(asset.name);
            items.push({
                id: asset.id,
                name: asset.name,
                displayName: asset.name,
                disabled: atLimit && !isInPrompt,
                inPrompt: isInPrompt,
                thumb: asset.refImageUrl,
            });
        }

        for (const si of sceneImages) {
            let isInPrompt = promptIdSet.has(si.id) || promptNameSet.has(si.name);
            // Storyboard suffix matching: prompt has 分镜S01 but si.name is 分镜E1_S01
            if (!isInPrompt && isStoryboardTag(si.name)) {
                const siSuffix = si.name.replace('分镜', ''); // "E1_S01"
                for (const pName of promptNameSet) {
                    if (isStoryboardTag(pName)) {
                        const pSuffix = pName.replace('分镜', ''); // "S01"
                        if (siSuffix === pSuffix || siSuffix.endsWith(`_${pSuffix}`)) {
                            isInPrompt = true;
                            break;
                        }
                    }
                }
            }
            items.push({
                id: si.id,
                name: si.name,
                displayName: si.name,
                disabled: atLimit && !isInPrompt,
                inPrompt: isInPrompt,
                thumb: si.refImageUrl,
            });
        }

        if (query) {
            return items.filter(item =>
                item.name.toLowerCase().includes(query.toLowerCase()) ||
                item.displayName.toLowerCase().includes(query.toLowerCase())
            );
        }
        return items;
    }, [availableAssets, sceneImages, referencedAssetIds, maxMentions, query, value]);

    // Handle input from contentEditable
    const handleInput = useCallback(() => {
        if (!editorRef.current) return;
        const newValue = htmlToText(editorRef.current);
        isInternalChange.current = true;
        lastRenderedValue.current = newValue;
        onChange(newValue);

        // Check for @ trigger
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            // Get text before cursor in current text node
            if (range.startContainer.nodeType === Node.TEXT_NODE) {
                const textBefore = (range.startContainer.textContent || '').substring(0, range.startOffset);
                const atMatch = textBefore.match(/@([^\s@]*)$/);
                if (atMatch) {
                    setQuery(atMatch[1] || '');
                    setShowDropdown(true);
                    setHighlightIdx(0);
                } else {
                    setShowDropdown(false);
                    setQuery('');
                }
            } else {
                setShowDropdown(false);
            }
        }

        // Diff tags to detect removals — use resolveTagToAsset for accurate matching
        const currentTags = extractTags(newValue);
        const prevTags = prevTagsRef.current;
        for (const tag of prevTags) {
            if (!currentTags.includes(tag)) {
                // Use resolveTagToAsset for consistent matching
                const resolved = resolveTagToAsset({ name: tag }, assets as any[]);
                if (resolved) {
                    onUnmention((resolved as any).id);
                } else {
                    const resolvedSi = resolveTagToAsset({ name: tag }, sceneImages as any[]);
                    if (resolvedSi) onUnmention((resolvedSi as any).id);
                }
            }
        }
        prevTagsRef.current = currentTags;
    }, [onChange, assets, sceneImages, onUnmention]);

    // Insert a mention chip at cursor
    const insertMentionAtCursor = useCallback((tagName: string, assetId?: string, thumb?: string) => {
        const el = editorRef.current;
        if (!el) return;

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);

        // Find and remove the @query text before cursor
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
            const textNode = range.startContainer;
            const text = textNode.textContent || '';
            const beforeCursor = text.substring(0, range.startOffset);
            const atIdx = beforeCursor.lastIndexOf('@');
            if (atIdx >= 0) {
                // Remove @query
                const newText = text.substring(0, atIdx) + text.substring(range.startOffset);
                textNode.textContent = newText;
                // Set cursor to atIdx
                range.setStart(textNode, atIdx);
                range.setEnd(textNode, atIdx);
            }
        }

        // Create chip element
        const colors = CHIP_COLORS[mode as 'video' | 'image'];
        const info = findAssetInfo(tagName, assets, sceneImages, assetId);

        const chip = document.createElement('span');
        chip.contentEditable = 'false';
        chip.dataset.mention = tagName;
        // Always attach #id anchor for exact matching (critical for names with parentheses)
        if (assetId && assetId !== '__base__') {
            chip.dataset.mentionId = assetId;
        }
        chip.style.cssText = `display:inline-flex;align-items:center;gap:1px;background:${colors.bg};border:1px solid ${colors.border};border-radius:4px;padding:1px 5px;margin:0 1px;font-size:11px;color:${colors.text};cursor:default;vertical-align:middle;line-height:1.6;user-select:all;font-weight:500;`;

        if (thumb) {
            const img = document.createElement('img');
            img.src = thumb;
            img.style.cssText = 'width:16px;height:16px;border-radius:2px;object-fit:cover;vertical-align:middle;margin-right:3px;display:inline-block;';
            chip.appendChild(img);
        } else {
            const icon = document.createElement('span');
            icon.textContent = '🧑';
            icon.style.marginRight = '3px';
            chip.appendChild(icon);
        }

        const label = document.createTextNode(info.displayName);
        chip.appendChild(label);

        // Insert chip + trailing space
        range.insertNode(chip);
        const space = document.createTextNode('\u00A0');
        chip.after(space);

        // Move cursor after space
        const newRange = document.createRange();
        newRange.setStartAfter(space);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        // Trigger update
        handleInput();
    }, [handleInput]);

    // Select a candidate
    const selectCandidate = useCallback((candidate: typeof candidates[0]) => {
        if (candidate.disabled) return;

        insertMentionAtCursor(candidate.name, candidate.id, candidate.thumb);
        setShowDropdown(false);
        setQuery('');

        const asset = assets.find(a => a.id === candidate.id);
        if (asset) onMention(asset.id);
    }, [insertMentionAtCursor, assets, onMention]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!showDropdown || candidates.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIdx(prev => (prev + 1) % candidates.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIdx(prev => (prev - 1 + candidates.length) % candidates.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selected = candidates[highlightIdx];
            if (selected && !selected.disabled) {
                selectCandidate(selected);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setShowDropdown(false);
        }
    }, [showDropdown, candidates, highlightIdx, selectCandidate]);

    const handleBlur = useCallback(() => {
        setTimeout(() => setShowDropdown(false), 200);
    }, []);

    // Scroll highlighted item into view
    useEffect(() => {
        if (!showDropdown || !dropdownRef.current) return;
        const items = dropdownRef.current.querySelectorAll('[data-candidate]');
        const item = items[highlightIdx] as HTMLElement;
        if (item) item.scrollIntoView({ block: 'nearest' });
    }, [highlightIdx, showDropdown]);

    // Compute dropdown position when it opens
    useEffect(() => {
        if (!showDropdown || !editorRef.current) {
            setDropdownPos(null);
            return;
        }
        const rect = editorRef.current.getBoundingClientRect();
        setDropdownPos({
            top: rect.top - 4,  // 4px gap above editor
            left: rect.left,
        });
    }, [showDropdown]);

    return (
        <div className="relative flex-1 flex flex-col">
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className={className}
                data-placeholder={placeholder}
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowY: 'auto' }}
            />

            {showDropdown && candidates.length > 0 && dropdownPos && ReactDOM.createPortal(
                <div
                    ref={dropdownRef}
                    style={{
                        position: 'fixed',
                        bottom: `${window.innerHeight - dropdownPos.top}px`,
                        left: `${dropdownPos.left}px`,
                        zIndex: 9999,
                    }}
                    className="w-72 max-h-48 overflow-y-auto bg-dark-800 border border-white/10 rounded-lg shadow-xl py-1"
                >
                    {maxMentions !== undefined && (
                        <div className="px-3 py-1 text-[9px] text-gray-500 border-b border-white/5">
                            参考图 {new Set([...value.matchAll(TAG_REGEX)].map(m => m[2] || m[1])).size}/{maxMentions}
                        </div>
                    )}
                    {candidates.map((c, i) => (
                        <div
                            key={c.id}
                            data-candidate
                            className={`
                                flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors
                                ${i === highlightIdx ? 'bg-banana-500/20' : 'hover:bg-white/5'}
                                ${c.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                            `}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                if (!c.disabled) selectCandidate(c);
                            }}
                            onMouseEnter={() => setHighlightIdx(i)}
                        >
                            {c.thumb ? (
                                <img src={c.thumb} className="w-5 h-5 rounded object-cover" />
                            ) : (
                                <span className="text-[10px]">🧑</span>
                            )}
                            <span className="flex-1 truncate">{c.displayName}</span>
                            {c.inPrompt && (
                                <span className="text-[9px] text-green-400/70">✅</span>
                            )}
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

export default MentionTextarea;
