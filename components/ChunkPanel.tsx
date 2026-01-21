import React, { useState } from 'react';
import { NovelChunk, Asset, GlobalStyle, Scene } from '../types';
import { Translation } from '../translations';
import { ChevronDown, ChevronRight, Wand2, FileText, Video, Download, CheckCircle, Loader2, Film, AlertTriangle, AlertCircle } from 'lucide-react';
import SceneCard from './SceneCard';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { generateVideo, reviewVideoPrompt, regenerateVideoPromptOptimized } from '../services/gemini';

interface ChunkPanelProps {
  chunk: NovelChunk;
  globalAssets: Asset[];
  styleState: GlobalStyle;
  labels: Translation;
  onUpdateChunk: (id: string, updates: Partial<NovelChunk>) => void;
  onSceneUpdate: (chunkId: string, sceneId: string, updates: Partial<Scene>) => void;
  onDuplicateScene: (chunkId: string, sceneId: string) => void;
  onExtract: (chunk: NovelChunk) => Promise<Asset[]>;
  onGenerateScript: (chunk: NovelChunk) => Promise<Scene[]>;
  onGenerateImage: (scene: Scene, chunkAssets?: Asset[]) => Promise<string>; // Updated signature
  language: string;
  isActive: boolean;
  onToggle: () => void;
  autoShoot?: boolean;
  isLocked?: boolean;
  flashSceneId?: string;
}

const ChunkPanel: React.FC<ChunkPanelProps> = ({
  chunk,
  globalAssets,
  styleState,
  labels,
  onUpdateChunk,
  onSceneUpdate,
  onDuplicateScene,
  onExtract,
  onGenerateScript,
  onGenerateImage,
  language,
  isActive,
  onToggle,
  autoShoot = false,
  isLocked = false,
  flashSceneId
}) => {
  const [loadingStep, setLoadingStep] = useState<'none' | 'extracting' | 'scripting' | 'filming'>('none');
  const [generatingSceneIds, setGeneratingSceneIds] = useState<string[]>([]);
  const [scriptError, setScriptError] = useState<string | null>(null);

  const handleAddChunkAsset = (newAsset: Asset) => {
      onUpdateChunk(chunk.id, { assets: [...chunk.assets, newAsset] });
  };

  // Auto-Shoot mechanism
  React.useEffect(() => {
    if (autoShoot) {
        // Debounce slightly to ensure rendering
        const t = setTimeout(() => {
            handleShoot();
        }, 500);
        return () => clearTimeout(t);
    }
  }, [autoShoot]);

  // Workflow Check: Are all assets in this chunk ready with ref images?
  // Only check assets that are actually used/listed in this chunk.
  const areAssetsReady = chunk.assets.length === 0 || chunk.assets.every(a => !!a.refImageUrl);

  const handleExtract = async () => {
    setLoadingStep('extracting');
    setScriptError(null);
    try {
        const newAssets = await onExtract(chunk);
        onUpdateChunk(chunk.id, { status: 'extracted' });
        if (!isActive) onToggle(); // Open if closed
    } catch (e: any) {
        console.error(e);
        setScriptError(e.message || "Failed to extract assets");
    } finally {
        setLoadingStep('none');
    }
  };

  const handleScript = async () => {
    setLoadingStep('scripting');
    setScriptError(null);
    try {
        const scenes = await onGenerateScript(chunk);
        if (!scenes || scenes.length === 0) throw new Error("Received empty script from AI");
        onUpdateChunk(chunk.id, { scenes, status: 'scripted' });
        if (!isActive) onToggle();
    } catch (e: any) {
        console.error("Script generation failed", e);
        setScriptError(e.message || "Failed to generate script. Please try again.");
    } finally {
        setLoadingStep('none');
    }
  };

  const handleDeleteScene = (sceneId: string) => {
      const newScenes = chunk.scenes.filter(s => s.id !== sceneId);
      onUpdateChunk(chunk.id, { scenes: newScenes });
  };
  
  const handleDuplicateScene = (sceneId: string) => {
      onDuplicateScene(chunk.id, sceneId);
  };

  const handleShoot = async () => {
    // Guard: Prevent multiple triggers if already shooting
    if (chunk.status === 'shooting' && generatingSceneIds.length > 0) return;
    
    onUpdateChunk(chunk.id, { status: 'shooting' });

    const scenesToProcess = chunk.scenes.filter(s => !s.imageUrl);
    const CONCURRENCY = 10;

    const processScene = async (scene: Scene) => {
        setGeneratingSceneIds(prev => [...prev, scene.id]);
        try {
            const url = await onGenerateImage(scene, chunk.assets);
            onSceneUpdate(chunk.id, scene.id, { imageUrl: url });
        } catch (e) {
            console.error(`Failed to gen image for scene ${scene.id}`, e);
        } finally {
            setGeneratingSceneIds(prev => prev.filter(id => id !== scene.id));
        }
    };

    try {
        const executing: Promise<void>[] = [];
        for (const scene of scenesToProcess) {
            const p = processScene(scene).then(() => {
                const idx = executing.indexOf(p);
                if (idx > -1) executing.splice(idx, 1);
            });
            executing.push(p);
            
            if (executing.length >= CONCURRENCY) {
                await Promise.race(executing);
            }
        }
        await Promise.all(executing);
    } catch (e) {
        console.error("Batch shoot failed", e);
    }
  };

  const handleMakeFilm = async () => {
      setLoadingStep('filming');
      // Iterate through scenes that have images but no videos
      const scenesToProcess = chunk.scenes.filter(s => s.imageUrl && !s.videoUrl);
      
      const MAX_RETRIES = 5;
      const CONCURRENCY = 3; // Changed from 10 to 1 to avoid 429 RESOURCE_EXHAUSTED

      const processSceneWithRetry = async (scene: Scene) => {
          if (!scene.imageUrl) return;
          
          let lastError;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              try {
                  const videoUrl = await generateVideo(scene.imageUrl, scene, styleState.aspectRatio, (scene.useAssets !== false) ? chunk.assets : []);
                  onSceneUpdate(chunk.id, scene.id, { videoUrl });
                  return; // Success
              } catch (e: any) {
                  const errorMsg = e?.message || String(e);
                  console.warn(`Video Gen failed for scene ${scene.id} (Attempt ${attempt}/${MAX_RETRIES})`, errorMsg);
                  lastError = e;

                  // Check for 429 or Quota Exceeded specifically
                  const isRateLimit = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
                  
                  // Backoff delay before retry
                  // Exponential backoff: 2s, 4s, 8s, 16s, 32s...
                  // If rate limit, add extra padding
                  if (attempt < MAX_RETRIES) {
                      const baseDelay = 2000 * Math.pow(2, attempt - 1);
                      const actualDelay = isRateLimit ? baseDelay * 2 : baseDelay; // Double delay for rate limits
                      console.log(`Waiting ${actualDelay}ms before retry for scene ${scene.id}...`);
                      await new Promise(resolve => setTimeout(resolve, actualDelay));
                  }
              }
          }
          console.error(`Final failure for scene ${scene.id} after ${MAX_RETRIES} attempts`, lastError);
      };

      try {
          // Concurrency Control
          const executing: Promise<void>[] = [];
          for (const scene of scenesToProcess) {
              const p = processSceneWithRetry(scene).then(() => {
                  const idx = executing.indexOf(p);
                  if (idx > -1) executing.splice(idx, 1);
              });
              executing.push(p);
              
              if (executing.length >= CONCURRENCY) {
                  await Promise.race(executing);
              }
          }
          // Wait for remaining
          await Promise.all(executing);
      } finally {
          setLoadingStep('none');
      }
  };

  const handleSceneUpdateWrapper = (sceneId: string, field: keyof Scene, value: any) => {
      onSceneUpdate(chunk.id, sceneId, { [field]: value });
  };

  const handleImageGenerated = (sceneId: string, url: string) => {
      // Use the thread-safe updater from App.tsx
      onSceneUpdate(chunk.id, sceneId, { imageUrl: url });
  };
  
  // Pass explicit assets to generator
  const handleGenerateImageInternal = (scene: Scene) => {
      return onGenerateImage(scene, chunk.assets);
  };

  const handleVideoGenerated = (sceneId: string, url: string) => {
      onSceneUpdate(chunk.id, sceneId, { videoUrl: url });
  };

  const handleDownload = async () => {
      const zip = new JSZip();
      
      // 1. Text Metadata
      const assetText = chunk.assets.map(a => `ID: ${a.id}\nName: ${a.name}\nDesc: ${a.description}\nDNA: ${a.visualDna||''}`).join('\n---\n');
      zip.file("assets.txt", assetText);

      // 2. Full JSON Data (Prompts, Scenes)
      const chunkData = {
          chunkId: chunk.id,
          text: chunk.text,
          assets: chunk.assets,
          scenes: chunk.scenes
      };
      zip.file("data.json", JSON.stringify(chunkData, null, 2));

      // 3. Images Folder
      const imgFolder = zip.folder("images");
      const vidFolder = zip.folder("videos");
      const audioFolder = zip.folder("narration");

      for (const scene of chunk.scenes) {
          if (scene.imageUrl) {
              const response = await fetch(scene.imageUrl);
              const blob = await response.blob();
              imgFolder?.file(`${scene.id}.png`, blob);
          }
          if (scene.videoUrl) {
              const response = await fetch(scene.videoUrl);
              const blob = await response.blob();
              vidFolder?.file(`${scene.id}.mp4`, blob);
          }
          if (scene.narrationAudioUrl) {
              const response = await fetch(scene.narrationAudioUrl);
              const blob = await response.blob();
              audioFolder?.file(`${scene.id}_narration.wav`, blob);
          }
      }

      // 4. Asset Reference Images
      const assetFolder = zip.folder("asset_refs");
      for (const asset of chunk.assets) {
          if (asset.refImageUrl) {
             const response = await fetch(asset.refImageUrl);
             const blob = await response.blob();
             assetFolder?.file(`${asset.id}_${asset.name}.png`, blob);
          }
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `nano_banana_chapter_${chunk.index + 1}.zip`);
  };

  return (
    <div className={`bg-dark-800 rounded-xl border overflow-hidden shadow-lg transition-all duration-300 ease-in-out w-[75%] ${isActive ? 'border-banana-500/30 ring-1 ring-banana-500/20' : 'border-white/10'}`}>
        
        {/* Header */}
        <div className={`p-4 flex items-center justify-between bg-white/5 cursor-pointer hover:bg-white/10 ${isLocked ? 'opacity-75' : ''}`} onClick={onToggle}>
            <div className="flex items-center gap-4">
                <button className="text-gray-400">
                    {isActive ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>
                <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        {labels.chunkLabel} {chunk.index + 1}
                        {isLocked && <span className="text-[10px] bg-banana-500/20 text-banana-400 px-2 py-0.5 rounded-full border border-banana-500/30">Auto-Focus</span>}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono mt-1">{chunk.text.substring(0, 50)}...</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                 {/* Asset Status Indicator */}
                 {!areAssetsReady && chunk.assets.length > 0 && (
                     <div className="text-yellow-500 text-xs flex items-center gap-1" title="Please generate asset images in the Assets tab first">
                         <AlertTriangle className="w-3.5 h-3.5" />
                         <span className="hidden md:inline">Assets Pending</span>
                     </div>
                 )}

                 <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                     chunk.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
                     chunk.status === 'shooting' ? 'bg-banana-500/20 text-banana-400 border border-banana-500/30 animate-pulse' :
                     'bg-gray-700 text-gray-400'
                 }`}>
                     {chunk.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                     {chunk.status}
                 </div>
            </div>
        </div>

        {/* Workflow Toolbar */}
        <div className="border-t border-white/10 p-2 bg-black/20 flex flex-wrap gap-2 justify-end items-center">
             
             {scriptError && (
                 <div className="mr-auto text-red-400 text-xs flex items-center gap-2 px-2">
                     <AlertCircle className="w-3.5 h-3.5" />
                     {scriptError}
                 </div>
             )}

             {chunk.status === 'completed' && (
                 <button onClick={handleDownload} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-xs font-bold text-white flex items-center gap-2">
                     <Download className="w-4 h-4" /> {labels.btnDownload}
                 </button>
             )}
             
             <button 
                onClick={(e) => { e.stopPropagation(); handleExtract(); }}
                disabled={loadingStep !== 'none'}
                className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded text-xs font-bold flex items-center gap-2"
             >
                 {loadingStep === 'extracting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                 {labels.btnExtract}
             </button>

             <div className="group relative">
                <button 
                    onClick={(e) => { e.stopPropagation(); handleScript(); }}
                    disabled={loadingStep !== 'none' || chunk.status === 'idle' || chunk.status === 'extracting'}
                    className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 ${
                        loadingStep === 'none' && chunk.status !== 'idle' && chunk.status !== 'extracting'
                        ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400' 
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    {loadingStep === 'scripting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    {labels.btnScript}
                </button>
                {(chunk.status === 'idle' || chunk.status === 'extracting') && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 bg-black/90 text-white text-[10px] p-2 rounded pointer-events-none hidden group-hover:block z-50 text-center">
                        {language === 'English' ? `Please run ${labels.btnExtract} first` : `请先${labels.btnExtract}`}
                    </div>
                )}
             </div>

             <div className="group relative">
                <button 
                    onClick={(e) => { e.stopPropagation(); handleShoot(); }}
                    disabled={chunk.scenes.length === 0}
                    className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 shadow-lg ${
                        chunk.scenes.length > 0
                        ? 'bg-banana-500 text-black hover:bg-banana-400 shadow-banana-500/20' 
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    <Video className="w-4 h-4" />
                    {labels.btnShoot}
                </button>
             </div>

             <button 
                onClick={(e) => { e.stopPropagation(); handleMakeFilm(); }}
                disabled={chunk.scenes.length === 0 || loadingStep === 'filming'}
                className="px-3 py-1.5 bg-red-500 text-white hover:bg-red-400 rounded text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-500/20"
             >
                 {loadingStep === 'filming' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                 {labels.btnFilm}
             </button>
        </div>

        {/* Content Body */}
        {isActive && (
            <div className="p-4 border-t border-white/10 space-y-4">
                 {chunk.scenes.length === 0 ? (
                     <div className="text-center py-8 text-gray-600 italic text-sm">
                         {labels.statusReady}. Generate Script to begin.
                     </div>
                 ) : (
                     <div className="space-y-4">
                         {chunk.scenes.map(scene => (
                             <SceneCard 
                                key={scene.id}
                                scene={scene}
                                characterDesc=""
                                labels={labels}
                                onUpdate={handleSceneUpdateWrapper}
                                onDelete={handleDeleteScene}
                                onDuplicate={handleDuplicateScene}
                                isGeneratingExternal={generatingSceneIds.includes(scene.id)}
                                onGenerateImageOverride={handleGenerateImageInternal}
                                onImageGenerated={handleImageGenerated}
                                onVideoGenerated={handleVideoGenerated}
                                globalStyle={styleState}
                                areAssetsReady={areAssetsReady}
                                assets={chunk.assets}
                                onAddAsset={handleAddChunkAsset}
                                language={language}
                                flash={flashSceneId === scene.id}
                             />
                         ))}
                     </div>
                 )}
            </div>
        )}
    </div>
  );
};

export default ChunkPanel;
