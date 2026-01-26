import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnalysisStatus, Scene, Asset, GlobalStyle, NovelChunk } from './types';
import { analyzeNovelText, extractAssets, generateSceneImage } from './services/gemini';
import { translations } from './translations';
import { saveState, loadState, clearState, loadAssetUrl, saveAsset } from './services/storage';
import InputPanel from './components/InputPanel';
import ChunkPanel from './components/ChunkPanel';
import ModelSelector from './components/ModelSelector';
import { AssetSelector } from './components/AssetSelector';
import { Film, AlertCircle, Globe, Video, Book, Trash2, PlayCircle, PauseCircle, Upload } from 'lucide-react';
import JSZip from 'jszip';

const CHUNK_SIZE = 5000; 
const STATE_KEY = 'storyboarder_session';

const DEFAULT_STYLES: Record<string, { directors: string[], works: string[], textures: string[] }> = {
  Chinese: {
    directors: ["王家卫", "张艺谋", "姜文", "李安", "宫崎骏", "新海诚", "克里斯托弗·诺兰", "昆汀·塔伦蒂诺", "斯皮尔伯格", "希区柯克", "黑泽明", "大卫·芬奇", "韦斯·安德森", "丹尼斯·维伦纽瓦", "奉俊昊", "周星驰", "徐克", "岩井俊二", "今敏", "蒂姆·波顿"],
    works: ["让子弹飞", "一代宗师", "卧虎藏龙", "千与千寻", "你的名字", "盗梦空间", "低俗小说", "阿凡达", "教父", "七武士", "搏击俱乐部", "布达佩斯大饭店", "沙丘", "寄生虫", "大话西游", "青蛇", "情书", "红辣椒", "剪刀手爱德华", "赛博朋克2077"],
    textures: ["写实摄影", "2D 动画", "2.5D 渲染", "3D 渲染 (Unreal Engine)", "水墨画", "黏土动画", "油画", "剪纸", "像素艺术", "胶片颗粒", "铅笔素描", "水彩", "浮世绘", "赛博朋克霓虹", "高对比度黑白", "复古 VHS", "低多边形", "乐高", "皮影", "概念艺术"]
  },
  English: {
    directors: ["Christopher Nolan", "Quentin Tarantino", "Steven Spielberg", "Martin Scorsese", "Wes Anderson", "David Fincher", "Hayao Miyazaki", "Akira Kurosawa", "Stanley Kubrick", "Alfred Hitchcock", "James Cameron", "Ridley Scott", "Denis Villeneuve", "Tim Burton", "Greta Gerwig", "Bong Joon-ho", "Wong Kar-wai", "Ang Lee", "Peter Jackson", "Guillermo del Toro"],
    works: ["Inception", "Pulp Fiction", "The Grand Budapest Hotel", "Fight Club", "Spirited Away", "Seven Samurai", "2001: A Space Odyssey", "Avatar", "Blade Runner", "Dune", "Parasite", "The Matrix", "The Godfather", "Star Wars", "Lord of the Rings", "Cyberpunk 2077", "Arcane", "Spider-Verse", "Mad Max: Fury Road", "Interstellar"],
    textures: ["Realistic Photography", "2D Anime", "2.5D Render", "3D Render", "Ink Wash", "Claymation", "Oil Painting", "Paper Cutout", "Pixel Art", "Vintage Film", "Sketch", "Watercolor", "Ukiyo-e", "Cyberpunk Neon", "Black & White", "VHS Glitch", "Low Poly", "Lego", "Silhouette", "Concept Art"]
  }
};

type HistoryAction =
  | {
      type: 'duplicate_scene';
      chunkId: string;
      insertIndex: number;
      sceneId: string;
      sceneSnapshot: Scene;
    };

const App: React.FC = () => {
  const [globalAssets, setGlobalAssets] = useState<Asset[]>([]);
  const [chunks, setChunks] = useState<NovelChunk[]>([]);
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flashScene, setFlashScene] = useState<{ chunkId: string; sceneId: string } | null>(null);
  const [showGlobalSelector, setShowGlobalSelector] = useState(false);
  const undoStackRef = useRef<HistoryAction[]>([]);
  const redoStackRef = useRef<HistoryAction[]>([]);

  // Sync expanded chunk with active chunk (e.g. when automation moves to next)
  useEffect(() => {
      if (activeChunkId) {
          setExpandedId(activeChunkId);
      }
  }, [activeChunkId]);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [language, setLanguage] = useState<string>("Chinese");
  
  // Style State
  const [globalStyle, setGlobalStyle] = useState<GlobalStyle>({
      director: { selected: 'None', strength: 5, seed: '5555', options: [] },
      work: { selected: 'None', strength: 5, seed: '5555', options: [] },
      texture: { selected: 'None', strength: 5, seed: '5555', options: [] },
      aspectRatio: '16:9',
      visualTags: '',
      narrationVoice: 'Kore' // Default Voice
  });

  const [filename, setFilename] = useState("");
  const [isRestored, setIsRestored] = useState(false);
  
  // Automation State
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [autoAssetTrigger, setAutoAssetTrigger] = useState(false);
  const [autoShootTrigger, setAutoShootTrigger] = useState(false);

  // Ref to track latest globalAssets for async operations
  const globalAssetsRef = useRef(globalAssets);

  // Ref to track which chunks are currently being scripted to prevent duplicate calls
  const scriptingChunksRef = useRef<Set<string>>(new Set());
  // Ref to track which chunks are currently being extracted to prevent duplicate calls
  const extractingChunksRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    globalAssetsRef.current = globalAssets;
  }, [globalAssets]);

  const t = translations[language] || translations["Chinese"];

  // Restore State
  useEffect(() => {
    const restoreSession = async () => {
        try {
            const savedState = await loadState(STATE_KEY);
            if (savedState) {
                if (savedState.globalAssets) {
                    // Lazy Hydration: Don't load Blob URLs eagerly. Components will load them via assetId.
                    const cleanAssets = savedState.globalAssets.map((asset: Asset) => ({
                         ...asset,
                         refImageUrl: asset.refImageUrl?.startsWith('blob:') ? undefined : asset.refImageUrl
                    }));
                    setGlobalAssets(cleanAssets);
                }
                if (savedState.chunks) {
                    // Hydrate chunks: Metadata only. Assets are loaded lazily by components.
                    const hydratedChunks = savedState.chunks.map((chunk: NovelChunk) => ({
                        ...chunk,
                        // Assets: Don't load Blob URLs eagerly.
                        assets: chunk.assets.map((asset: Asset) => ({
                             ...asset,
                             refImageUrl: asset.refImageUrl?.startsWith('blob:') ? undefined : asset.refImageUrl
                        })),
                        scenes: chunk.scenes.map((scene: Scene) => {
                            // Scene Media: Don't load Blob URLs eagerly.
                            // If we have an assetId, we rely on the component to load it via LazyMedia/useAssetUrl.
                            
                            let newVideoUrl = scene.videoUrl;
                            let newImageUrl = scene.imageUrl;
                            
                            // If it was a blob URL, clear it (it's dead after reload).
                            // We rely on videoAssetId/imageAssetId.
                            if (newVideoUrl?.startsWith('blob:')) {
                                newVideoUrl = undefined;
                            }
                            if (newImageUrl?.startsWith('blob:')) {
                                newImageUrl = undefined;
                            }
                            
                            return {
                                ...scene,
                                videoUrl: newVideoUrl,
                                imageUrl: newImageUrl,
                                narrationAudioUrl: scene.narrationAudioUrl?.startsWith('blob:') ? undefined : scene.narrationAudioUrl
                            };
                        })
                    }));
                    setChunks(hydratedChunks);
                }
                if (savedState.globalStyle) setGlobalStyle(savedState.globalStyle);
                if (savedState.language) setLanguage(savedState.language);
                if (savedState.filename) setFilename(savedState.filename);
            }
        } catch (e) {
            console.error("Failed to restore session", e);
        } finally {
            setIsRestored(true);
        }
    };
    restoreSession();
  }, []);

  // Save State
  useEffect(() => {
    if (!isRestored) return;
    
    const timeoutId = setTimeout(() => {
        saveState(STATE_KEY, {
            globalAssets,
            chunks,
            globalStyle,
            language,
            filename
        }).catch(e => console.error("Failed to save state", e));
    }, 1000); // Debounce 1s

    return () => clearTimeout(timeoutId);
  }, [globalAssets, chunks, globalStyle, language, filename, isRestored]);

  useEffect(() => {
     const defaults = DEFAULT_STYLES[language] || DEFAULT_STYLES["English"];
     setGlobalStyle(prev => ({
         ...prev,
         director: { ...prev.director, options: defaults.directors },
         work: { ...prev.work, options: defaults.works },
         texture: { ...prev.texture, options: defaults.textures }
     }));
  }, [language]);

  const handleLoadNovel = (text: string, fname: string) => {
    if (!text) {
        setChunks([]);
        setFilename("");
        return;
    }
    setFilename(fname);
    const newChunks: NovelChunk[] = [];
    let cursor = 0;
    let index = 0;
    while (cursor < text.length) {
        const end = Math.min(cursor + CHUNK_SIZE, text.length);
        const chunkText = text.substring(cursor, end);
        newChunks.push({
            id: `chunk_${Date.now()}_${index}`,
            index: index,
            text: chunkText,
            status: 'idle',
            assets: [],
            scenes: []
        });
        cursor = end;
        index++;
    }
    setChunks(newChunks);
  };

  const updateChunk = (id: string, updates: Partial<NovelChunk>) => {
      setChunks(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const deepClone = <T,>(value: T): T => {
      if (typeof globalThis.structuredClone === 'function') {
          return globalThis.structuredClone(value);
      }
      return JSON.parse(JSON.stringify(value)) as T;
  };

  const ensureUniqueId = (desiredId: string, existingIds: Set<string>) => {
      if (!existingIds.has(desiredId)) return desiredId;
      let i = 2;
      let candidate = `${desiredId}_${i}`;
      while (existingIds.has(candidate)) {
          i += 1;
          candidate = `${desiredId}_${i}`;
      }
      return candidate;
  };

  const createDuplicateSceneId = (sourceId: string, existingIds: Set<string>) => {
      return ensureUniqueId(`${sourceId}_copy`, existingIds);
  };

  const remapSelfAssetIds = (ids: string[] | undefined, oldSceneId: string, newSceneId: string) => {
      if (!ids) return ids;
      const oldSelfId = `scene_img_${oldSceneId}`;
      const newSelfId = `scene_img_${newSceneId}`;
      return ids.map(id => (id === oldSelfId ? newSelfId : id));
  };

  const triggerFlashScene = (chunkId: string, sceneId: string) => {
      setFlashScene({ chunkId, sceneId });
      window.setTimeout(() => {
          setFlashScene(prev => (prev?.chunkId === chunkId && prev?.sceneId === sceneId ? null : prev));
      }, 900);
  };

  const handleDuplicateScene = (chunkId: string, sceneId: string) => {
      let nextAction: HistoryAction | null = null;
      setChunks(prev =>
          prev.map(chunk => {
              if (chunk.id !== chunkId) return chunk;
              const idx = chunk.scenes.findIndex(s => s.id === sceneId);
              if (idx < 0) return chunk;

              const existingIds = new Set<string>(chunk.scenes.map(s => s.id));
              const sourceScene = chunk.scenes[idx];
              const newSceneId = createDuplicateSceneId(sourceScene.id, existingIds);
              const cloned = deepClone(sourceScene);
              cloned.id = newSceneId;
              cloned.assetIds = remapSelfAssetIds(cloned.assetIds, sourceScene.id, newSceneId);
              cloned.videoAssetIds = remapSelfAssetIds(cloned.videoAssetIds, sourceScene.id, newSceneId);

              nextAction = {
                  type: 'duplicate_scene',
                  chunkId,
                  insertIndex: idx + 1,
                  sceneId: newSceneId,
                  sceneSnapshot: deepClone(cloned)
              };

              const newScenes = [...chunk.scenes.slice(0, idx + 1), cloned, ...chunk.scenes.slice(idx + 1)];
              return { ...chunk, scenes: newScenes };
          })
      );
      if (nextAction) {
          undoStackRef.current.push(nextAction);
          redoStackRef.current = [];
          triggerFlashScene(nextAction.chunkId, nextAction.sceneId);
      }
  };

  const undo = () => {
      const action = undoStackRef.current.pop();
      if (!action) return;

      if (action.type === 'duplicate_scene') {
          let removedScene: Scene | null = null;
          setChunks(prev =>
              prev.map(chunk => {
                  if (chunk.id !== action.chunkId) return chunk;
                  const idx = chunk.scenes.findIndex(s => s.id === action.sceneId);
                  if (idx < 0) return chunk;
                  removedScene = chunk.scenes[idx];
                  const newScenes = [...chunk.scenes.slice(0, idx), ...chunk.scenes.slice(idx + 1)];
                  return { ...chunk, scenes: newScenes };
              })
          );
          if (removedScene) {
              redoStackRef.current.push({ ...action, sceneSnapshot: deepClone(removedScene) });
          } else {
              redoStackRef.current.push(action);
          }
      }
  };

  const redo = () => {
      const action = redoStackRef.current.pop();
      if (!action) return;

      if (action.type === 'duplicate_scene') {
          let nextAction: HistoryAction | null = null;
          setChunks(prev =>
              prev.map(chunk => {
                  if (chunk.id !== action.chunkId) return chunk;
                  const existingIds = new Set<string>(chunk.scenes.map(s => s.id));
                  const insertIndex = Math.min(Math.max(action.insertIndex, 0), chunk.scenes.length);

                  const sceneToInsert = deepClone(action.sceneSnapshot);
                  const desiredId = sceneToInsert.id;
                  const finalId = ensureUniqueId(desiredId, existingIds);
                  if (finalId !== desiredId) {
                      sceneToInsert.id = finalId;
                      sceneToInsert.assetIds = remapSelfAssetIds(sceneToInsert.assetIds, desiredId, finalId);
                      sceneToInsert.videoAssetIds = remapSelfAssetIds(sceneToInsert.videoAssetIds, desiredId, finalId);
                  }

                  nextAction = {
                      type: 'duplicate_scene',
                      chunkId: action.chunkId,
                      insertIndex,
                      sceneId: sceneToInsert.id,
                      sceneSnapshot: deepClone(sceneToInsert)
                  };

                  const newScenes = [
                      ...chunk.scenes.slice(0, insertIndex),
                      sceneToInsert,
                      ...chunk.scenes.slice(insertIndex)
                  ];
                  return { ...chunk, scenes: newScenes };
              })
          );
          if (nextAction) {
              undoStackRef.current.push(nextAction);
              triggerFlashScene(nextAction.chunkId, nextAction.sceneId);
          } else {
              undoStackRef.current.push(action);
          }
      }
  };

  useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
          const isModifier = e.ctrlKey || e.metaKey;
          if (!isModifier) return;

          const active = document.activeElement as HTMLElement | null;
          const tag = active?.tagName?.toLowerCase();
          const isEditing =
              tag === 'input' ||
              tag === 'textarea' ||
              tag === 'select' ||
              (active ? (active as any).isContentEditable === true : false);
          if (isEditing) return;

          const key = e.key.toLowerCase();
          const isUndo = key === 'z' && !e.shiftKey;
          const isRedo = (key === 'z' && e.shiftKey) || key === 'y';

          if (isUndo) {
              e.preventDefault();
              undo();
          } else if (isRedo) {
              e.preventDefault();
              redo();
          }
      };

      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ---------------------------------------------------------------------------
  // AUTOMATION LOGIC
  // ---------------------------------------------------------------------------

  // 1. Parallel Trigger on 'extracted': 
  //    When a chunk becomes 'extracted', we simultaneously start Scripting AND Asset Generation
  useEffect(() => {
      if (!isAutoMode || !activeChunkId) return;

      const chunk = chunks.find(c => c.id === activeChunkId);
      if (!chunk) return;

      // Auto-recover/Start from IDLE
      if (chunk.status === 'idle') {
          if (!extractingChunksRef.current.has(chunk.id)) {
               handleChunkExtract(chunk).then(() => {
                   updateChunk(chunk.id, { status: 'extracted' });
               }).catch(e => console.warn("Auto-recover extraction failed", e));
          }
          return;
      }

      if (chunk.status !== 'extracted') return;

      // ACTION A: Start Scripting (Text Track)
      // We call the handleChunkScript logic directly here, but we need to wrap it to update state
      const autoScript = async () => {
          try {
             // Check if already scripted to avoid loops
             if (chunk.scenes.length > 0) return; 

             const scenes = await handleChunkScript(chunk);
             if (scenes && scenes.length > 0) {
                 updateChunk(chunk.id, { scenes, status: 'scripted' });
             }
          } catch (e: any) {
              if (e.message === "Generation in progress") return;
              console.error("Auto script failed", e);
              // If failed, we might want to pause automation or retry
              setIsAutoMode(false); 
          }
      };
      autoScript();

      // ACTION B: Start Asset Generation (Visual Track)
      // We toggle the trigger prop for AssetLibrary
      // Only if there are missing assets
      const needsAssets = chunk.assets.some(a => !a.refImageUrl);
      if (needsAssets) {
          setAutoAssetTrigger(true);
          // Reset trigger after a moment so it can be re-triggered if needed
          setTimeout(() => setAutoAssetTrigger(false), 1000);
      } else {
          // If no assets need generation, we treat it as "batch complete" immediately
          // to ensure pipeline continuity (pre-load next chunk)
          handleAssetBatchComplete();
      }

  }, [isAutoMode, activeChunkId, chunks]); // Dependencies: monitor these changes

  // 2. Convergence Trigger for 'Shoot':
  //    When Script is ready AND Assets are ready -> Shoot
  useEffect(() => {
      if (!isAutoMode || !activeChunkId) return;

      const chunk = chunks.find(c => c.id === activeChunkId);
      if (!chunk) return;

      const isScriptReady = chunk.status === 'scripted' && chunk.scenes.length > 0;
      const isAssetsReady = chunk.assets.length === 0 || chunk.assets.every(a => !!a.refImageUrl);

      // Guard: Only trigger if not already shooting/completed and trigger not active
      if (isScriptReady && isAssetsReady && !autoShootTrigger && chunk.status !== 'shooting' && chunk.status !== 'completed') {
          // Trigger Shoot
          setAutoShootTrigger(true);
          setTimeout(() => setAutoShootTrigger(false), 1000);
      }

  }, [isAutoMode, activeChunkId, chunks, autoShootTrigger]);

  // 3. Pipelining: Next Chapter Pre-loading
  //    This is triggered when the *Current* chapter's assets are done.
  //    See: handleAssetBatchComplete below.

  const handleAssetBatchComplete = () => {
      if (!isAutoMode || !activeChunkId) return;
      
      // Look ahead for the next chunk
      const currentIndex = chunks.findIndex(c => c.id === activeChunkId);
      if (currentIndex === -1 || currentIndex === chunks.length - 1) return;

      const nextChunk = chunks[currentIndex + 1];
      
      // If next chunk is idle, start extracting it (Pipeline Pre-load)
      if (nextChunk.status === 'idle' && !extractingChunksRef.current.has(nextChunk.id)) {
          handleChunkExtract(nextChunk).then(() => {
              updateChunk(nextChunk.id, { status: 'extracted' });
          }).catch(e => console.warn("Pre-load extraction failed", e));
      }
  };

  // 4. Auto-Advance: When shooting is done
  useEffect(() => {
      if (!isAutoMode || !activeChunkId) return;
      const chunk = chunks.find(c => c.id === activeChunkId);
      if (chunk && chunk.status === 'completed') {
          // Move to next chapter
          const currentIndex = chunks.findIndex(c => c.id === activeChunkId);
          if (currentIndex < chunks.length - 1) {
              const nextChunk = chunks[currentIndex + 1];
              setActiveChunkId(nextChunk.id);
              // The state change to 'extracted' (from pipeline) or 'idle' will trigger the cycle again
              
              // Fallback: If pipeline didn't catch it (still idle), force start extraction
              if (nextChunk.status === 'idle' && !extractingChunksRef.current.has(nextChunk.id)) {
                  handleChunkExtract(nextChunk).then(() => {
                      updateChunk(nextChunk.id, { status: 'extracted' });
                  }).catch(e => console.warn("Fallback extraction failed", e));
              }
          } else {
              // Finished all chapters
              setIsAutoMode(false);
              alert(t.allChaptersDone || "All chapters completed!");
          }
      }
  }, [chunks, isAutoMode, activeChunkId]);

  // Safe update for individual scenes to avoid race conditions during batch generation
  const handleSceneUpdate = (chunkId: string, sceneId: string, updates: Partial<Scene>) => {
      setChunks(prev => prev.map(c => {
          if (c.id !== chunkId) return c;
          
          const updatedScenes = c.scenes.map(s => s.id === sceneId ? { ...s, ...updates } : s);
          // Check if all are done to update status
          const allImagesDone = updatedScenes.every(s => !!s.imageUrl);
          const newStatus = (c.status === 'shooting' && allImagesDone) ? 'completed' : c.status;

          return { ...c, scenes: updatedScenes, status: newStatus };
      }));
  };

  const handleChunkExtract = async (chunk: NovelChunk) => {
     if (extractingChunksRef.current.has(chunk.id)) {
         console.warn(`Extraction for chunk ${chunk.id} already in progress.`);
         return;
     }
     extractingChunksRef.current.add(chunk.id);

     try {
         const workStyle = globalStyle.work.custom || (globalStyle.work.selected !== 'None' ? globalStyle.work.selected : '');
         const textureStyle = globalStyle.texture.custom || (globalStyle.texture.selected !== 'None' ? globalStyle.texture.selected : '');
         const useOriginalCharacters = globalStyle.work.useOriginalCharacters || false;
         
         // Use ref to get latest assets to avoid duplicates
         const result = await extractAssets(chunk.text, language, globalAssetsRef.current, workStyle, textureStyle, useOriginalCharacters);
         
         if (result.visualDna) {
            setGlobalStyle(prev => ({ ...prev, visualTags: result.visualDna }));
         }

         // Use ref to get latest state for merging, avoiding stale closure overwrites
         const currentAssets = globalAssetsRef.current;
         const newAssets = [...currentAssets];
         let hasChanges = false;

         result.assets.forEach(extractedAsset => {
            const existingIndex = newAssets.findIndex(ga => ga.id === extractedAsset.id);
            if (existingIndex === -1) {
                newAssets.push(extractedAsset);
                hasChanges = true;
            } 
         });

         if (hasChanges) {
             setGlobalAssets(newAssets);
         }

         const chunkAssets = result.assets.map(extracted => {
             return newAssets.find(ga => ga.id === extracted.id) || extracted;
         });

         updateChunk(chunk.id, { assets: chunkAssets });
         return chunkAssets;
     } catch (e) {
         console.error("Chunk extraction failed", e);
         throw e; // Re-throw to allow caller to handle or retry
     } finally {
         extractingChunksRef.current.delete(chunk.id);
     }
  };

  const handleManualExtractAssets = async (text: string) => {
     setStatus(AnalysisStatus.EXTRACTING);
     try {
         const workStyle = globalStyle.work.custom || (globalStyle.work.selected !== 'None' ? globalStyle.work.selected : '');
         const textureStyle = globalStyle.texture.custom || (globalStyle.texture.selected !== 'None' ? globalStyle.texture.selected : '');
         const useOriginalCharacters = globalStyle.work.useOriginalCharacters || false;

         // Use ref to pass latest assets to prompt
         const result = await extractAssets(text, language, globalAssetsRef.current, workStyle, textureStyle, useOriginalCharacters);
         
         if (result.visualDna) {
            setGlobalStyle(prev => ({ ...prev, visualTags: result.visualDna }));
         }
         
         setGlobalAssets(prev => {
             const newAssets = [...prev];
             result.assets.forEach(extracted => {
                 if (!newAssets.some(ga => ga.id === extracted.id)) {
                     newAssets.push(extracted);
                 }
             });
             return newAssets;
         });
         
         setStatus(AnalysisStatus.COMPLETED);
     } catch (e) {
         console.error("Manual Extract Error", e);
         setStatus(AnalysisStatus.ERROR);
         setTimeout(() => setStatus(AnalysisStatus.IDLE), 3000);
     }
  };

  const handleChunkScript = async (chunk: NovelChunk) => {
     if (scriptingChunksRef.current.has(chunk.id)) {
         console.warn(`Script generation for chunk ${chunk.id} already in progress.`);
         throw new Error("Generation in progress");
     }
     scriptingChunksRef.current.add(chunk.id);

     try {
         const prevIndex = chunk.index - 1;
         let prevContext = "";
         if (prevIndex >= 0) {
            const prevChunk = chunks[prevIndex];
            if (prevChunk.scenes.length > 0) {
                prevContext = prevChunk.scenes[prevChunk.scenes.length - 1].narration;
            }
         }
         const { scenes, visualDna } = await analyzeNovelText(chunk.text, language, globalAssets, globalStyle, prevContext);
         
         if (visualDna) {
            setGlobalStyle(prev => ({ ...prev, visualTags: visualDna }));
         }

         return scenes;
     } finally {
         scriptingChunksRef.current.delete(chunk.id);
     }
  };

  const handleImportChunk = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          const zip = await JSZip.loadAsync(file);
          
          // 1. Read Metadata
          const dataFile = zip.file("data.json");
          if (!dataFile) throw new Error("Invalid format: data.json missing");
          
          const jsonStr = await dataFile.async("string");
          const importedData = JSON.parse(jsonStr);
          
          // Validate structure
          if (!importedData.scenes || !importedData.text) throw new Error("Invalid chunk data");

          const newChunk: NovelChunk = {
              ...importedData,
              id: `chunk_${Date.now()}_import`, // Generate new ID to avoid conflict
              // Status inference logic
              status: 'scripted', 
          };

          // 2. Restore Assets (Characters/Locations)
          const restoredAssets: Asset[] = [];
          for (const asset of (importedData.assets || [])) {
              let refImageUrl = asset.refImageUrl;
              let refImageAssetId = asset.refImageAssetId;

              // Check for image in zip
              // Handle both potential naming conventions if needed, currently we use id_name.png
              const imgFile = zip.file(`asset_refs/${asset.id}_${asset.name}.png`);
              if (imgFile) {
                  const blob = await imgFile.async("blob");
                  refImageAssetId = await saveAsset(blob);
                  const url = await loadAssetUrl(refImageAssetId);
                  if (url) refImageUrl = url;
              }

              restoredAssets.push({
                  ...asset,
                  refImageUrl,
                  refImageAssetId
              });
          }
          newChunk.assets = restoredAssets;

          // Merge assets into global assets (avoid duplicates by ID)
          setGlobalAssets(prev => {
              const next = [...prev];
              restoredAssets.forEach(a => {
                  if (!next.some(existing => existing.id === a.id)) {
                      next.push(a);
                  }
              });
              return next;
          });

          // 3. Restore Scenes
          const restoredScenes: Scene[] = [];
          for (const scene of (importedData.scenes || [])) {
              let imageUrl = scene.imageUrl;
              let imageAssetId = scene.imageAssetId;
              let videoUrl = scene.videoUrl;
              let videoAssetId = scene.videoAssetId;
              let narrationAudioUrl = scene.narrationAudioUrl;

              // Image
              const imgFile = zip.file(`images/${scene.id}.png`);
              if (imgFile) {
                  const blob = await imgFile.async("blob");
                  imageAssetId = await saveAsset(blob);
                  const url = await loadAssetUrl(imageAssetId);
                  if (url) imageUrl = url;
              }

              // Video
              const vidFile = zip.file(`videos/${scene.id}.mp4`);
              if (vidFile) {
                  const blob = await vidFile.async("blob");
                  videoAssetId = await saveAsset(blob);
                  const url = await loadAssetUrl(videoAssetId);
                  if (url) videoUrl = url;
              }

              // Audio
              const audioFile = zip.file(`narration/${scene.id}_narration.wav`);
              if (audioFile) {
                  const blob = await audioFile.async("blob");
                  narrationAudioUrl = URL.createObjectURL(blob);
              }

              restoredScenes.push({
                  ...scene,
                  imageUrl,
                  imageAssetId,
                  videoUrl,
                  videoAssetId,
                  narrationAudioUrl
              });
          }
          newChunk.scenes = restoredScenes;
          
          // Determine status more accurately
          if (newChunk.scenes.length > 0) {
             if (newChunk.scenes.every(s => !!s.videoUrl || !!s.videoAssetId)) newChunk.status = 'completed';
             else if (newChunk.scenes.every(s => !!s.imageUrl || !!s.imageAssetId)) newChunk.status = 'shooting';
          }

          // Add to chunks
          setChunks(prev => [...prev, newChunk]);

      } catch (err: any) {
          console.error("Import failed", err);
          alert((language === 'Chinese' ? "导入失败: " : "Import Failed: ") + err.message);
      } finally {
          // Reset input
          e.target.value = '';
      }
  };

  const handleAnalyze = async (manualText: string) => {
     handleLoadNovel(manualText, "Manual Input");
  };

  const activeChunk = activeChunkId ? chunks.find(c => c.id === activeChunkId) : null;
  // If user expands a specific chunk (expandedId), show assets for THAT chunk.
  // Otherwise, if automation is running (activeChunkId), show that. 
  // Fallback to global.
  const targetChunkId = expandedId || activeChunkId;
  const targetChunk = targetChunkId ? chunks.find(c => c.id === targetChunkId) : null;
  // 智能资产显示逻辑：
  // 1. 基础：显示当前章节的资产（如果选中了章节）。如果没选中任何章节，则显示全局资产。
  // 2. 增强：如果选中了章节，还要自动扫描并显示该章节场景中“借用”的外部资产（即场景用了但不在章节资产列表里的）。
  const displayedAssets = useMemo(() => {
      if (!targetChunk) return globalAssets;

      // 1. 基础列表：当前章节的资产
      const chunkAssets = targetChunk.assets;
      const chunkAssetIds = new Set(chunkAssets.map(a => a.id));

      // 2. 收集场景中引用的所有资产ID
      const usedAssetIds = new Set<string>();
      targetChunk.scenes.forEach(scene => {
          if (scene.assetIds) scene.assetIds.forEach(id => usedAssetIds.add(id));
          if (scene.videoAssetIds) scene.videoAssetIds.forEach(id => usedAssetIds.add(id));
          if (scene.imageAssetId) usedAssetIds.add(scene.imageAssetId);
          if (scene.videoAssetId) usedAssetIds.add(scene.videoAssetId);
      });

      // 3. 找出“借用”的资产（在场景里用了，但在当前章节资产列表里没有）
      const borrowedAssets: Asset[] = [];
      usedAssetIds.forEach(id => {
          // 排除不需要显示的虚拟ID或空ID
          if (!id || id.startsWith('scene_img_')) return;

          if (!chunkAssetIds.has(id)) {
              // 从全局里找
              const found = globalAssets.find(ga => ga.id === id);
              if (found) {
                  borrowedAssets.push(found);
              }
          }
      });

      // 4. 合并并返回
      return [...chunkAssets, ...borrowedAssets];
  }, [targetChunk, globalAssets]);

  // IMPORTANT: Pass the context-aware assets and explicit scene data to generation
  const handleGenerateImageWrapper = async (scene: Scene, chunkAssets?: Asset[]) => {
      // Prioritize chunk assets if active, otherwise use displayedAssets (which handles fallback)
      const assetsToUse = chunkAssets || displayedAssets;
      // Pass the scene's prompt and explicit asset IDs for stricter reference adherence
      return await generateSceneImage(scene.np_prompt, "", globalStyle, assetsToUse, scene.assetIds);
  };

  const handleUpdateAsset = (updatedAsset: Asset) => {
      // 1. 总是更新全局资产（真理之源）
      setGlobalAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a));

      // 2. 同步更新所有包含该资产的章节
      // 逻辑：
      // A. 如果章节里已有该资产 -> 必须更新（无论是否当前章节）
      // B. 如果章节里没有该资产 -> 只有是当前聚焦章节（targetChunkId）时才新增
      setChunks(prev => prev.map(chunk => {
          const exists = chunk.assets.some(a => a.id === updatedAsset.id);
          
          if (exists) {
              // 场景A：已存在 -> 更新（广播同步）
              return {
                  ...chunk,
                  assets: chunk.assets.map(a => a.id === updatedAsset.id ? updatedAsset : a)
              };
          } else if (chunk.id === targetChunkId) {
              // 场景B：不存在且是当前章节 -> 新增（绑定到当前章节）
              return {
                  ...chunk,
                  assets: [...chunk.assets, updatedAsset]
              };
          }
          
          // 其他情况保持不变
          return chunk;
      }));
  };

  const handleAddAsset = (newAsset: Asset) => {
      if (targetChunkId) {
          // Add to current chunk
          updateChunk(targetChunkId, { assets: [...(targetChunk?.assets || []), newAsset] });
          
          // Also sync to global assets so it persists when chunk is closed
          setGlobalAssets(prev => {
              if (prev.some(a => a.id === newAsset.id)) return prev;
              return [...prev, newAsset];
          });
      } else {
          // Add to global
          setGlobalAssets(prev => [...prev, newAsset]);
      }
  };

  const handleDeleteAsset = (id: string) => {
      if (targetChunkId) {
          // Delete from current chunk only
          setChunks(prev => prev.map(chunk => {
              if (chunk.id !== targetChunkId) return chunk;
              return {
                  ...chunk,
                  assets: chunk.assets.filter(a => a.id !== id)
              };
          }));
      } else {
          setGlobalAssets(prev => prev.filter(a => a.id !== id));
          setChunks(prev => prev.map(chunk => ({
              ...chunk,
              assets: chunk.assets.filter(a => a.id !== id)
          })));
      }
  };

  const handleDeleteChunk = (chunkId: string) => {
      if (confirm(t.confirmDeleteChunk)) {
          setChunks(prev => prev.filter(c => c.id !== chunkId));
          // If the deleted chunk was active, reset active/expanded states
          if (activeChunkId === chunkId) setActiveChunkId(null);
          if (expandedId === chunkId) setExpandedId(null);
      }
  };

  return (
    <div className="min-h-screen bg-dark-900 text-gray-100 flex flex-col font-sans selection:bg-banana-500/30">
      
      {/* Header */}
      <header className="bg-dark-800 border-b border-white/5 sticky top-0 z-50 backdrop-blur-md bg-opacity-80">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-banana-400 to-banana-600 rounded-lg flex items-center justify-center shadow-lg shadow-banana-500/20">
              <Film className="w-5 h-5 text-dark-900" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 hidden sm:block">
              {t.appTitle} <span className="font-light text-banana-400">Pro</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-3 text-xs md:text-sm">
             <button 
                onClick={() => {
                    const nextMode = !isAutoMode;
                    setIsAutoMode(nextMode);

                    if (nextMode && chunks.length > 0) {
                        // Determine which chunk to focus on
                        // If activeChunkId is set, use it. Otherwise find first non-completed.
                        let targetChunk = activeChunkId ? chunks.find(c => c.id === activeChunkId) : null;
                        
                        if (!targetChunk) {
                             targetChunk = chunks.find(c => c.status !== 'completed') || chunks[0];
                             setActiveChunkId(targetChunk.id);
                        }
                        
                        if (targetChunk) {
                            // Kickstart logic for the target chunk
                            if (targetChunk.status === 'idle') {
                                handleChunkExtract(targetChunk).then(() => {
                                    updateChunk(targetChunk.id, { status: 'extracted' });
                                });
                            } else if (targetChunk.status === 'scripted') {
                                const needsAssets = targetChunk.assets.some(a => !a.refImageUrl);
                                if (needsAssets) {
                                    setAutoAssetTrigger(true);
                                    setTimeout(() => setAutoAssetTrigger(false), 1000);
                                }
                            }
                        }
                    }
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                    isAutoMode 
                    ? 'bg-banana-500 text-black border-banana-400 shadow-lg shadow-banana-500/20 animate-pulse' 
                    : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                }`}
                title={isAutoMode ? "Turn Off Automation" : "Turn On Automation"}
             >
                {isAutoMode ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                <span className="font-bold">{isAutoMode ? "AUTO ON" : "AUTO OFF"}</span>
             </button>

             <button 
                onClick={async () => {
                    if (confirm(language === 'Chinese' ? "确定要清除所有缓存并重置吗？这将丢失当前所有进度。" : "Are you sure you want to clear cache? All progress will be lost.")) {
                        await clearState(STATE_KEY);
                        window.location.reload();
                    }
                }}
                className="p-2 text-gray-400 hover:text-red-400 transition-colors rounded-full hover:bg-white/5"
                title={language === 'Chinese' ? "清除缓存并重置" : "Clear Cache & Reset"}
             >
                <Trash2 className="w-4 h-4" />
             </button>

             <ModelSelector />

             <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full border border-white/5 hover:border-banana-500/30 transition-colors">
                <label className="cursor-pointer flex items-center gap-2 text-gray-400 hover:text-banana-400 transition-colors" title={language === 'Chinese' ? "导入章节片段 (ZIP)" : "Import Chunk (ZIP)"}>
                    <Upload className="w-4 h-4" />
                    <input type="file" accept=".zip" className="hidden" onChange={handleImportChunk} />
                </label>
             </div>

             <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full border border-white/5 hover:border-banana-500/30 transition-colors">
                <Globe className="w-3.5 h-3.5 text-banana-400" />
                <select 
                  value={language} 
                  onChange={(e) => setLanguage(e.target.value)}
                  className="bg-transparent border-none focus:outline-none text-gray-300 font-medium cursor-pointer appearance-none pr-1 text-center"
                  style={{ textAlignLast: 'center' }}
                >
                  <option value="Chinese" className="bg-dark-800 text-white">中文</option>
                  <option value="English" className="bg-dark-800 text-white">English</option>
                  <option value="Japanese" className="bg-dark-800 text-white">日本語</option>
                  <option value="Korean" className="bg-dark-800 text-white">한국어</option>
                  <option value="Spanish" className="bg-dark-800 text-white">Español</option>
                  <option value="French" className="bg-dark-800 text-white">Français</option>
                </select>
             </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-4rem)]">
        
        {/* Left: Settings Panel */}
        <div className="lg:col-span-3 h-full lg:sticky lg:top-24 flex flex-col gap-4">
          <InputPanel 
            onAnalyze={handleAnalyze} 
            onLoadNovel={handleLoadNovel}
            novelStatus={{ 
                hasNovel: chunks.length > 0, 
                filename: filename, 
                progress: `${chunks.filter(c => c.status === 'completed').length} / ${chunks.length}`
            }}
            status={status} 
            labels={t} 
            assets={displayedAssets} 
            onUpdateAsset={handleUpdateAsset}
            onAddAsset={handleAddAsset}
            onDeleteAsset={handleDeleteAsset}
            onExtractAssets={handleManualExtractAssets} 
            styleState={globalStyle}
            onStyleChange={setGlobalStyle}
            language={language}
            autoAssetTrigger={autoAssetTrigger}
            onAssetBatchComplete={handleAssetBatchComplete}
            onImportFromGlobal={targetChunkId ? () => setShowGlobalSelector(true) : undefined}
          />
        </div>

        {/* Right: Chunk Workflow Stream */}
        <div className="lg:col-span-9 flex flex-col gap-4 pb-20 relative">
          
           {chunks.length === 0 && (
             <div className="flex flex-col items-center justify-center h-full opacity-30 text-center p-8 border-2 border-dashed border-white/10 rounded-xl mt-10">
                <Book className="w-16 h-16 mb-4" />
                <h3 className="text-xl font-bold">{t.readyTitle}</h3>
                <p className="max-w-md">{t.readyDesc}</p>
             </div>
           )}

           {chunks.map((chunk) => (
               <ChunkPanel 
                  key={chunk.id}
                  chunk={chunk}
                  globalAssets={globalAssets}
                  styleState={globalStyle}
                  labels={t}
                  onUpdateChunk={updateChunk}
                  onDeleteChunk={handleDeleteChunk}
                  onSceneUpdate={handleSceneUpdate}
                  onDuplicateScene={handleDuplicateScene}
                  onExtract={handleChunkExtract}
                  onGenerateScript={handleChunkScript}
                  onGenerateImage={handleGenerateImageWrapper}
                  language={language}
                  isActive={expandedId === chunk.id}
                  flashSceneId={flashScene?.chunkId === chunk.id ? flashScene.sceneId : undefined}
                  onToggle={() => {
                      // Toggle expansion
                      setExpandedId(expandedId === chunk.id ? null : chunk.id);
                      // Only hijack automation focus if automation is OFF
                      if (!isAutoMode) {
                          setActiveChunkId(activeChunkId === chunk.id ? null : chunk.id);
                      }
                  }}
                  autoShoot={activeChunkId === chunk.id ? autoShootTrigger : false}
                  isLocked={isAutoMode && activeChunkId !== chunk.id} // Just visual now
               />
           ))}

        </div>
      </main>

      {showGlobalSelector && (
          <AssetSelector 
              assets={globalAssets}
              onClose={() => setShowGlobalSelector(false)}
              onSelect={() => {}} 
              allowMultiple={true}
              selectedIds={targetChunk?.assets.map(a => a.id) || []}
              onConfirm={(selectedIds) => {
                  if (targetChunkId && targetChunk) {
                      const newAssets = globalAssets.filter(a => selectedIds.includes(a.id));
                      const existingIds = new Set(targetChunk.assets.map(a => a.id));
                      const uniqueNew = newAssets.filter(a => !existingIds.has(a.id));
                      
                      if (uniqueNew.length > 0) {
                          updateChunk(targetChunkId, { assets: [...targetChunk.assets, ...uniqueNew] });
                      }
                  }
                  setShowGlobalSelector(false);
              }}
          />
      )}
    </div>
  );
};

export default App;
