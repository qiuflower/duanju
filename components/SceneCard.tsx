import React, { useState, useEffect, useRef } from 'react';
import { Scene, ImageGenStatus, GlobalStyle, Asset } from '../types';
import { generateSceneImage, generateSpeech, pcmToWav, generateVideo, regenerateScenePrompt, matchAssetsToPrompt, updateVideoPromptDirectly } from '../services/gemini';
import { Translation } from '../translations';
import { AssetSelector } from './AssetSelector';
import { Image as ImageIcon, Copy, Aperture, RefreshCw, Download, MessageSquare, Music, Video, Clock, Camera, Zap, Volume2, Mic, Film, Upload, Plus, Trash2, Link as LinkIcon, X } from 'lucide-react';

interface SceneCardProps {
  scene: Scene;
  characterDesc: string;
  labels: Translation;
  onUpdate: (id: string, field: keyof Scene, value: any) => void;
  onDelete?: (id: string) => void; // New prop for delete handler
  onDuplicate?: (id: string) => void;
  isGeneratingExternal?: boolean; 
  onGenerateImageOverride?: (scene: Scene) => Promise<string>;
  onImageGenerated?: (id: string, url: string) => void;
  onVideoGenerated?: (id: string, url: string) => void;
  globalStyle: GlobalStyle;
  areAssetsReady?: boolean; // New Prop for workflow enforcement
  assets?: Asset[];
  onAddAsset?: (asset: Asset) => void;
  language?: string;
  isOptimizing?: boolean; // New prop to show loading state from parent
  flash?: boolean;
}

const SceneCard: React.FC<SceneCardProps> = ({ 
    scene, 
    characterDesc, 
    labels, 
    onUpdate, 
    onDelete,
    onDuplicate,
    isGeneratingExternal = false,
    onGenerateImageOverride,
    onImageGenerated,
    onVideoGenerated,
    globalStyle,
    areAssetsReady = true,
    assets = [],
    onAddAsset,
    language = 'Chinese',
    isOptimizing = false,
    flash = false
}) => {
  const [genStatus, setGenStatus] = useState<ImageGenStatus>(ImageGenStatus.IDLE);
  const [videoStatus, setVideoStatus] = useState<ImageGenStatus>(ImageGenStatus.IDLE);
  const [viewMode, setViewMode] = useState<'image' | 'video'>('image');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(scene.narrationAudioUrl || null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isGeneratingRef = useRef(false);
  
  const [useAssets, setUseAssets] = useState(scene.useAssets ?? true);
  const [activeAssetSelector, setActiveAssetSelector] = useState<'none' | 'image' | 'video'>('none');
  const [promptGenLoading, setPromptGenLoading] = useState(false);
  const [videoPromptUpdating, setVideoPromptUpdating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Ref to track the latest image URL to avoid stale closure/prop issues during rapid interactions
  const latestImageRef = useRef<string | null>(scene.imageUrl || null);
  const lastSceneIdRef = useRef(scene.id);

  // Clear local image ref immediately when scene ID changes to prevent cross-scene pollution
  if (lastSceneIdRef.current !== scene.id) {
      lastSceneIdRef.current = scene.id;
      latestImageRef.current = null;
  }


  const updateVideoPromptWithAssets = async (newAssetIds: string[], overrideAssets?: Asset[]) => {
      setVideoPromptUpdating(true);
      try {
          const tempScene = { ...scene, assetIds: newAssetIds };
          let assetsToUse = overrideAssets || assets;

          // Helper: Inject "Current Scene" asset if it's selected but not in the list
          const currentSceneId = `scene_img_${scene.id}`;
          if (newAssetIds.includes(currentSceneId)) {
             // Check if it's already in assetsToUse
             if (!assetsToUse.find(a => a.id === currentSceneId)) {
                 const virtualSceneAsset: Asset = {
                    id: currentSceneId,
                    name: "Current Scene",
                    description: "The current generated storyboard image for this scene.",
                    type: "item",
                    refImageUrl: scene.imageUrl
                };
                assetsToUse = [...assetsToUse, virtualSceneAsset];
             }
          }
          
          // Direct Update without Review
          const optimized = await updateVideoPromptDirectly(tempScene, language, assetsToUse, globalStyle);
          
          onUpdate(scene.id, 'video_prompt', optimized.prompt);
          if (optimized.specs.duration) onUpdate(scene.id, 'video_duration', optimized.specs.duration);
          if (optimized.specs.camera) onUpdate(scene.id, 'video_camera', optimized.specs.camera);
          if (optimized.specs.lens) onUpdate(scene.id, 'video_lens', optimized.specs.lens);
          if (optimized.specs.vfx) onUpdate(scene.id, 'video_vfx', optimized.specs.vfx);
          
      } catch (e) {
          console.error("Video prompt update failed", e);
      } finally {
          setVideoPromptUpdating(false);
      }
  };

  const updatePromptWithAssets = async (newAssetIds: string[], overrideAssets?: Asset[]) => {
      setPromptGenLoading(true);
      // Update IDs immediately
      onUpdate(scene.id, 'assetIds', newAssetIds);
      
      try {
          // Create temp scene for API call
          const tempScene = { ...scene, assetIds: newAssetIds };
          const assetsToUse = overrideAssets || assets;
          const newPrompt = await regenerateScenePrompt(tempScene, assetsToUse, globalStyle, language);
          onUpdate(scene.id, 'np_prompt', newPrompt);
      } catch (e) {
          console.error("Prompt refresh failed", e);
      } finally {
          setPromptGenLoading(false);
      }
  };

  const handleSpecChange = async (field: keyof Scene, value: string) => {
      // 1. Update local state immediately
      onUpdate(scene.id, field, value);

      // 2. Trigger optimization (Direct Update)
      setVideoPromptUpdating(true);
      try {
          const tempScene = { ...scene, [field]: value };
          
          // Optimize prompt based on new spec directly
          const optimized = await updateVideoPromptDirectly(tempScene, language, assets, globalStyle);
          
          onUpdate(scene.id, 'video_prompt', optimized.prompt);
          
          // Note: We don't overwrite the spec fields again with optimized.specs here 
          // to avoid fighting with the user's input.
          
      } catch (e) {
          console.error("Spec update optimization failed", e);
      } finally {
          setVideoPromptUpdating(false);
      }
  };

  const handleAddAsset = (assetId: string, newAsset?: Asset) => {
    // Determine which list to update based on active selector
    if (activeAssetSelector === 'video') {
        if (scene.isStartEndFrameMode) {
            // --- START/END FRAME MODE ---
            // Requirement: Add Asset = Set End Frame
            const currentSceneImgId = `scene_img_${scene.id}`;
            const newIds = [currentSceneImgId, assetId];
            
            // Backup current prompt before update
            onUpdate(scene.id, 'video_prompt_backup', scene.video_prompt);

            // Update Start/End Asset IDs
            onUpdate(scene.id, 'startEndAssetIds', newIds);
            
            // Trigger Prompt Update (Requirement: Only on user ADD reference image)
            const assetsToUse = newAsset ? [...assets, newAsset] : assets;
            updateVideoPromptWithAssets(newIds, assetsToUse);
            
        } else {
            // --- STANDARD MODE ---
            const currentVideoIds = scene.videoAssetIds || scene.assetIds?.slice(0, 3) || [];
            
            if (currentVideoIds.length >= 3) {
                alert("Video storyboard supports a maximum of 3 reference assets.");
                return;
            }
    
            if (!currentVideoIds.includes(assetId)) {
                const newIds = [...currentVideoIds, assetId];
                const assetsToUse = newAsset ? [...assets, newAsset] : assets;
                
                // Only update Video Prompt and Video Asset IDs
                onUpdate(scene.id, 'videoAssetIds', newIds);
                updateVideoPromptWithAssets(newIds, assetsToUse);
            }
        }
    } else {
        // Image Mode (Original Behavior)
        const currentIds = scene.assetIds || [];
        if (!currentIds.includes(assetId)) {
            const newIds = [...currentIds, assetId];
            const assetsToUse = newAsset ? [...assets, newAsset] : assets;
            updatePromptWithAssets(newIds, assetsToUse);
        }
    }
    setActiveAssetSelector('none');
  };

  const handleRemoveAsset = (assetId: string, mode: 'image' | 'video' = 'image') => {
      if (mode === 'video') {
          if (scene.isStartEndFrameMode) {
               // --- START/END FRAME MODE ---
               // Remove End Frame
               const currentSceneImgId = `scene_img_${scene.id}`;
               // Reset to just Start Frame
               const newIds = [currentSceneImgId];
               onUpdate(scene.id, 'startEndAssetIds', newIds);
               
               // Restore Backup Prompt if available
               if (scene.video_prompt_backup) {
                   //console.log(`[SceneCard] Restoring Backup Prompt for Scene ${scene.id}`);
                   onUpdate(scene.id, 'video_prompt', scene.video_prompt_backup);
                   // Clear backup after restore (optional, but good practice if we only want one-level undo)
                   onUpdate(scene.id, 'video_prompt_backup', undefined);
               } else {
                   // Fallback: If no backup, trigger update to ensure consistency
                   //console.warn(`[SceneCard] No backup found for Scene ${scene.id}, triggering regeneration.`);
                   updateVideoPromptWithAssets(newIds);
               }
               
          } else {
              // --- STANDARD MODE ---
              const currentVideoIds = scene.videoAssetIds || scene.assetIds?.slice(0, 3) || [];
              const newIds = currentVideoIds.filter(id => id !== assetId);
              onUpdate(scene.id, 'videoAssetIds', newIds);
              updateVideoPromptWithAssets(newIds);
          }
      } else {
          const currentIds = scene.assetIds || [];
          const newIds = currentIds.filter(id => id !== assetId);
          updatePromptWithAssets(newIds);
      }
  };

  // Sync prop change
  useEffect(() => {
    if (scene.useAssets !== undefined) {
      setUseAssets(scene.useAssets);
    }
  }, [scene.useAssets]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          latestImageRef.current = result; // Update ref immediately
          onUpdate(scene.id, 'imageUrl', result);
          setGenStatus(ImageGenStatus.COMPLETED);

          // Force reset Start/End frame mode to ensure consistency immediately
          if (scene.isStartEndFrameMode) {
             const currentSceneImgId = `scene_img_${scene.id}`;
             onUpdate(scene.id, 'startEndAssetIds', [currentSceneImgId]);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Sync prop image/video url with local status
  useEffect(() => {
      if (scene.imageUrl) {
          latestImageRef.current = scene.imageUrl;
          setGenStatus(ImageGenStatus.COMPLETED);
          
          // --- Auto-Populate Video Assets Logic ---
          // When image is generated (and wasn't there before, or we are initializing),
          // we populate video assets.
          
          if (scene.isStartEndFrameMode) {
               // Start/End Mode: Requirement 2 - "Only retain scene image as start frame" on refresh.
               // We force reset to just the Start Frame whenever the image is updated/generated.
               const currentSceneImgId = `scene_img_${scene.id}`;
               onUpdate(scene.id, 'startEndAssetIds', [currentSceneImgId]);
           } else {
               // Standard Mode
               if (scene.videoAssetIds === undefined) {
                  const currentSceneImgId = `scene_img_${scene.id}`;
                  
                  // 1. Get Top Matched Assets (exclude current scene image concept from this matching)
                  // We match against visual_desc using the assets present in assetIds
                  const availableAssets = assets.filter(a => (scene.assetIds || []).includes(a.id));
                  const matched = matchAssetsToPrompt(scene.visual_desc, availableAssets, scene.assetIds || []);
                  
                  // Take Top 2
                  const top2Ids = matched.slice(0, 2).map(a => a.id);
                  
                  // Combine: [SceneImage, ...Top2]
                  const initialVideoIds = [currentSceneImgId, ...top2Ids];
                  
                  // Update Scene State
                  onUpdate(scene.id, 'videoAssetIds', initialVideoIds);
              }
          }
      }
      
      if (scene.videoUrl) {
          setVideoStatus(ImageGenStatus.COMPLETED);
          setViewMode('video');
      }
      if (scene.narrationAudioUrl) setAudioUrl(scene.narrationAudioUrl);
  }, [scene.imageUrl, scene.videoUrl, scene.narrationAudioUrl]);

  useEffect(() => {
    if (viewMode !== 'video') return;
    if (!scene.videoUrl) return;
    const el = videoRef.current;
    if (!el) return;
    try {
      el.pause();
      el.load();
      el.currentTime = 0;
    } catch {}
  }, [scene.videoUrl, viewMode]);


  const handleGenerateImage = async (force: boolean = false) => {
    if (isGeneratingRef.current) return;
    if (!areAssetsReady) return;
    if (!force && scene.imageUrl) return; 
    
    isGeneratingRef.current = true;
    setGenStatus(ImageGenStatus.GENERATING);
    try {
      let url = "";
      if (onGenerateImageOverride) {
          url = await onGenerateImageOverride(scene);
      } else {
          // Fallback if no override provided, though App usually provides it
          url = await generateSceneImage(scene.np_prompt, characterDesc, globalStyle, [], scene.assetIds);
      }
      setGenStatus(ImageGenStatus.COMPLETED);
      if (onImageGenerated) {
          onImageGenerated(scene.id, url);
      }
    } catch (error) {
      console.error(error);
      setGenStatus(ImageGenStatus.ERROR);
    } finally {
      isGeneratingRef.current = false;
    }
  };

  const handleGenerateVideo = async () => {
    const imageToUse = latestImageRef.current || scene.imageUrl;
    if (!imageToUse) return; // Need image first
    setVideoStatus(ImageGenStatus.GENERATING);
    try {
      const url = await generateVideo(imageToUse, scene, globalStyle.aspectRatio, useAssets ? assets : []);
      setVideoStatus(ImageGenStatus.COMPLETED);
      if (onVideoGenerated) {
          onVideoGenerated(scene.id, url);
      }
    } catch (error) {
      console.error(error);
      setVideoStatus(ImageGenStatus.ERROR);
    }
  };

  const handleNarrationTTS = async () => {
    if (!scene.narration) return;
    
    setTtsLoading(true);
    try {
        const voiceId = globalStyle.narrationVoice || "Kore";
        const base64Data = await generateSpeech(scene.narration, voiceId);
        
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const wavBlob = pcmToWav(bytes.buffer, 24000, 1);
        
        // Convert to Base64 Data URL for persistence
        const reader = new FileReader();
        reader.readAsDataURL(wavBlob);
        reader.onloadend = () => {
            const url = reader.result as string;
            setAudioUrl(url);
            onUpdate(scene.id, 'narrationAudioUrl', url); // Save to scene state
            
            setTimeout(() => {
                 if (audioRef.current) {
                     audioRef.current.src = url;
                     audioRef.current.play();
                 }
            }, 100);
        };

    } catch (e) {
        console.error("Narration TTS Failed", e);
    } finally {
        setTtsLoading(false);
    }
  };

  const handleDownloadAudio = () => {
      if (audioUrl) {
          const link = document.createElement('a');
          link.href = audioUrl;
          link.download = `narration_${scene.id}.wav`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
  };

  const saveImage = async () => {
      const imageToSave = latestImageRef.current || scene.imageUrl;
      if (imageToSave) {
          try {
              let href = imageToSave;
              // If it's not a data URL, fetch it as a blob to force download
              if (!imageToSave.startsWith('data:')) {
                  const response = await fetch(imageToSave);
                  const blob = await response.blob();
                  href = URL.createObjectURL(blob);
              }
              
              const link = document.createElement('a');
              link.href = href;
              link.download = `scene_${scene.id}.png`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);

              // Cleanup blob URL if created
              if (href !== imageToSave) {
                  URL.revokeObjectURL(href);
              }
          } catch (e) {
              console.error("Failed to download image", e);
              // Fallback to direct link
              const link = document.createElement('a');
              link.href = imageToSave;
              link.download = `scene_${scene.id}.png`;
              link.target = "_blank";
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
          }
      }
  };

  const handleRefresh = () => {
    if (scene.videoUrl) {
        handleGenerateVideo();
    } else {
        handleGenerateImage(true);
    }
  };

  return (
    <div className={`bg-dark-800 rounded-xl border border-white/10 overflow-hidden shadow-lg hover:border-banana-500/30 transition-colors duration-300 relative ${flash ? 'ring-2 ring-banana-400/60 animate-pulse' : ''}`}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <div className="flex flex-col md:flex-row">
        
        {/* LEFT COLUMN: VISUAL / IMAGE / VIDEO */}
        <div className="w-full md:w-[320px] bg-black/40 min-h-[250px] relative border-b md:border-b-0 md:border-r border-white/5 flex items-center justify-center group shrink-0">
          
          {/* Start/End Frame Mode Toggle */}
          {scene.imageUrl && (
            <div className="absolute top-2 left-2 z-10">
                <button
                    onClick={() => {
                        const newValue = !scene.isStartEndFrameMode;
                        onUpdate(scene.id, 'isStartEndFrameMode', newValue);
                        
                        // Initialize startEndAssetIds if enabling
                        if (newValue) {
                            // Requirement: "Default to scene image as start frame"
                            // Requirement: "Initial selection... do not refresh prompt"
                            const startId = `scene_img_${scene.id}`;
                            // Preserve existing if present (switching back), otherwise init
                            if (!scene.startEndAssetIds || scene.startEndAssetIds.length === 0) {
                                onUpdate(scene.id, 'startEndAssetIds', [startId]);
                            }
                        }
                        
                        //console.log(`Scene ${scene.id}: Start/End Frame Mode ${newValue ? 'Enabled' : 'Disabled'}`);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-sm ${
                        scene.isStartEndFrameMode 
                            ? 'bg-banana-500 text-black shadow-lg shadow-banana-500/20' 
                            : 'bg-black/60 text-gray-300 hover:bg-black/80 border border-white/10'
                    }`}
                    title={scene.isStartEndFrameMode ? "关闭首尾帧模式" : "开启首尾帧模式 (强制使用 veo3.1-pro-4k)"}
                >
                    <div className={`w-2 h-2 rounded-full transition-colors ${scene.isStartEndFrameMode ? 'bg-black' : 'bg-gray-400'}`} />
                    首尾帧模式
                </button>
            </div>
          )}

          {scene.imageUrl ? (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              {viewMode === 'video' && scene.videoUrl ? (
                  <video 
                    key={scene.videoUrl}
                    ref={videoRef}
                    controls 
                    className="max-w-full max-h-[320px] object-contain"
                  >
                    <source src={scene.videoUrl} type="video/mp4" />
                  </video>
              ) : (
                  <img 
                    src={scene.imageUrl} 
                    alt={`Scene ${scene.id}`} 
                    className="max-w-full max-h-[320px] w-auto h-auto object-contain cursor-pointer"
                    onClick={saveImage}
                    title={labels.saveImage}
                  />
              )}

              {/* View Toggle */}
              {(scene.imageUrl && scene.videoUrl) && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex bg-black/80 rounded-full p-1 border border-white/10 gap-1 z-20">
                    <button 
                        onClick={() => setViewMode('image')}
                        className={`p-1.5 rounded-full transition-all ${viewMode === 'image' ? 'bg-banana-500 text-black' : 'text-gray-400 hover:text-white'}`}
                        title="Show Image"
                    >
                        <ImageIcon className="w-3 h-3" />
                    </button>
                    <button 
                        onClick={() => setViewMode('video')}
                        className={`p-1.5 rounded-full transition-all ${viewMode === 'video' ? 'bg-banana-500 text-black' : 'text-gray-400 hover:text-white'}`}
                        title="Show Video"
                    >
                        <Video className="w-3 h-3" />
                    </button>
                </div>
              )}

              {/* Toolbar Overlay */}
               <div className="absolute top-2 right-2 flex flex-col gap-2 z-10">
                   {/* Upload Button */}
                   <button 
                        onClick={handleUploadClick} 
                        className="p-2 bg-black/60 text-white rounded-full hover:bg-banana-500 hover:text-black transition-colors opacity-0 group-hover:opacity-100" 
                        title={labels.uploadImage || "Upload Image"}
                    >
                     <Upload className="w-4 h-4" />
                   </button>

                   {/* Regenerate Button (Image or Video) */}
                   <button 
                        onClick={handleRefresh} 
                        className={`p-2 bg-black/60 text-white rounded-full hover:bg-banana-500 hover:text-black transition-colors ${(genStatus === ImageGenStatus.GENERATING || videoStatus === ImageGenStatus.GENERATING) ? 'animate-spin cursor-not-allowed opacity-50' : 'opacity-0 group-hover:opacity-100'}`} 
                        title={labels.regenerate}
                        disabled={genStatus === ImageGenStatus.GENERATING || videoStatus === ImageGenStatus.GENERATING || !areAssetsReady}
                    >
                     <RefreshCw className="w-4 h-4" />
                   </button>
                   
                   {/* Generate Video Button */}
                   {!scene.videoUrl && (
                       <button 
                            onClick={handleGenerateVideo} 
                            disabled={videoStatus === ImageGenStatus.GENERATING}
                            className={`p-2 bg-blue-600/80 text-white rounded-full hover:bg-blue-500 transition-colors ${videoStatus === ImageGenStatus.GENERATING ? 'cursor-not-allowed' : 'opacity-0 group-hover:opacity-100'}`} 
                            title={labels.genVideo}
                        >
                            {videoStatus === ImageGenStatus.GENERATING ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Film className="w-4 h-4" />}
                       </button>
                   )}

                   {/* Download Image (Visible if Image Exists) */}
                   {scene.imageUrl && (
                        <button 
                            onClick={saveImage} 
                            className="p-2 bg-black/60 text-white rounded-full hover:bg-banana-500 hover:text-black transition-colors opacity-0 group-hover:opacity-100" 
                            title={labels.saveImage}
                        >
                            <Download className="w-4 h-4" />
                        </button>
                   )}
               </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center w-full">
              {genStatus === ImageGenStatus.GENERATING || isGeneratingExternal ? (
                <div className="flex flex-col items-center gap-3">
                   <div className="w-8 h-8 border-2 border-banana-400 border-t-transparent rounded-full animate-spin" />
                   <span className="text-xs text-banana-400 font-mono animate-pulse">{labels.rendering}</span>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                      <ImageIcon className="w-6 h-6 text-gray-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative group/btn">
                        <button
                            onClick={() => handleGenerateImage(false)}
                            disabled={!areAssetsReady}
                            className={`px-4 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 ${
                                areAssetsReady 
                                ? 'bg-white/5 hover:bg-banana-500 hover:text-black border-white/10' 
                                : 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                            }`}
                        >
                            <Aperture className="w-4 h-4" />
                            {labels.visualizeBtn}
                        </button>
                        {!areAssetsReady && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-black/90 text-white text-[10px] p-2 rounded pointer-events-none hidden group-hover/btn:block z-50 text-center">
                                Generate Assets first
                            </div>
                        )}
                    </div>
                    
                    <button
                        onClick={handleUploadClick}
                        className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        title={labels.uploadImage || "Upload Image"}
                    >
                        <Upload className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: CONTENT */}
        <div className="flex-1 flex flex-col min-w-0">
            
            {/* Header: Scene ID & Narration (Primary TTS Target) */}
            <div className="p-4 border-b border-white/5 bg-white/5 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-banana-500 bg-banana-500/10 px-2 py-0.5 rounded">
                        {labels.scene} {scene.id}
                    </span>
                    <div className="flex-1 flex gap-2 items-center flex-wrap">
                         <input 
                            value={scene.narration}
                            onChange={(e) => onUpdate(scene.id, 'narration', e.target.value)}
                            className="flex-1 min-w-[180px] bg-transparent border-none text-white font-medium focus:outline-none focus:ring-0 placeholder-gray-600"
                            placeholder="Narration..."
                         />
                         
                         {/* Narration Generation Button */}
                         <div className="flex items-center gap-1">
                             <button 
                                onClick={handleNarrationTTS}
                                disabled={ttsLoading || !scene.narration}
                                className={`text-[10px] px-2 py-1 rounded text-white flex items-center gap-1 transition-colors whitespace-nowrap ${ttsLoading ? 'bg-gray-600' : 'bg-banana-500/20 text-banana-400 hover:bg-banana-500/30'}`}
                                title="Generate Narration Audio"
                             >
                                {ttsLoading ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Mic className="w-3 h-3" />}
                                {labels.dialogueBtn}
                             </button>
                             
                             {audioUrl && (
                                 <button 
                                    onClick={handleDownloadAudio}
                                    className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                                    title="Download Audio"
                                 >
                                     <Download className="w-3 h-3" />
                                 </button>
                             )}
                         </div>
                         {onDuplicate && (
                            <button 
                                onClick={() => onDuplicate(scene.id)}
                                className="p-1 text-gray-400 hover:text-banana-500 transition-colors rounded hover:bg-white/5"
                                title={labels.copy}
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </button>
                         )}
                         {/* Delete Scene Button */}
                         {onDelete && (
                            <button 
                                onClick={() => onDelete(scene.id)}
                                className="p-1 hover:bg-red-500/20 text-gray-500 hover:text-red-500 rounded transition-colors"
                                title="Delete Scene"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                         )}
                    </div>
                </div>
                <audio ref={audioRef} className="hidden" controls />
            </div>

            {/* Middle: Split Content (Video Left, Image/Dialogue Right) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
                
                {/* 1. LEFT PANE: VIDEO PROMPT (Expanded, Full Height) */}
                <div className="p-3 flex flex-col gap-2 bg-black/10 h-full">
                     <div className="flex justify-between items-center">
                         <h4 className="text-[10px] uppercase tracking-widest text-blue-400 font-bold flex items-center gap-2">
                             <Video className="w-3 h-3" />
                             {labels.videoPromptLabel}
                         </h4>
                         <div className="flex items-center gap-2">
                             <input 
                                type="checkbox" 
                                id={`useAssets-${scene.id}`}
                                checked={useAssets} 
                                onChange={(e) => {
                                setUseAssets(e.target.checked);
                                onUpdate(scene.id, 'useAssets', e.target.checked);
                            }}
                                className="w-3 h-3 rounded border-gray-600 text-banana-500 focus:ring-banana-500/50 bg-gray-700"
                             />
                             <label htmlFor={`useAssets-${scene.id}`} className="text-[10px] text-gray-400 cursor-pointer select-none">
                                 Use Assets
                             </label>
                         </div>
                     </div>
                     
                     {/* Video Params Grid */}
                     <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mb-1">
                        <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                           <Clock className="w-3 h-3 text-blue-400"/> 
                           <span className="opacity-50">{labels.durationLabel}:</span>
                           <input 
                                value={scene.video_duration || ''} 
                                onChange={e => onUpdate(scene.id, 'video_duration', e.target.value)} 
                                onBlur={e => handleSpecChange('video_duration', e.target.value)}
                                onKeyDown={e => { if(e.key === 'Enter') { e.currentTarget.blur(); } }}
                                className="bg-transparent w-full outline-none" 
                                placeholder="3s" 
                           />
                        </div>
                        <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                           <Camera className="w-3 h-3 text-blue-400"/> 
                           <span className="opacity-50">{labels.lensLabel}:</span>
                           <input 
                                value={scene.video_lens || ''} 
                                onChange={e => onUpdate(scene.id, 'video_lens', e.target.value)} 
                                onBlur={e => handleSpecChange('video_lens', e.target.value)}
                                onKeyDown={e => { if(e.key === 'Enter') { e.currentTarget.blur(); } }}
                                className="bg-transparent w-full outline-none" 
                                placeholder="35mm" 
                           />
                        </div>
                        <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                           <Video className="w-3 h-3 text-blue-400"/> 
                           <span className="opacity-50">{labels.cameraLabel}:</span>
                           <input 
                                value={scene.video_camera || ''} 
                                onChange={e => onUpdate(scene.id, 'video_camera', e.target.value)} 
                                onBlur={e => handleSpecChange('video_camera', e.target.value)}
                                onKeyDown={e => { if(e.key === 'Enter') { e.currentTarget.blur(); } }}
                                className="bg-transparent w-full outline-none" 
                                placeholder="Pan" 
                           />
                        </div>
                        <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                           <Zap className="w-3 h-3 text-blue-400"/> 
                           <span className="opacity-50">{labels.vfxLabel}:</span>
                           <input 
                                value={scene.video_vfx || ''} 
                                onChange={e => onUpdate(scene.id, 'video_vfx', e.target.value)} 
                                onBlur={e => handleSpecChange('video_vfx', e.target.value)}
                                onKeyDown={e => { if(e.key === 'Enter') { e.currentTarget.blur(); } }}
                                className="bg-transparent w-full outline-none" 
                                placeholder="-" 
                           />
                        </div>
                     </div>

                     {/* Reference Image IDs List (Video) */}
                     {scene.imageUrl ? (
                     <div className="flex flex-col gap-2 mb-1">
                        {scene.isStartEndFrameMode ? (
                            /* --- START/END FRAME MODE UI --- */
                            <div className="flex flex-col gap-1.5 p-2 bg-banana-500/5 border border-banana-500/20 rounded-lg">
                                <div className="text-[10px] text-banana-500/70 font-bold uppercase tracking-wider mb-0.5">Start/End Frames</div>
                                
                                {/* 1. Start Frame (Fixed) */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono text-gray-500 w-8 text-right">START</span>
                                    <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 rounded px-1.5 py-1 text-[10px] text-green-200 flex-1">
                                        <ImageIcon className="w-3 h-3 opacity-70" />
                                        <span className="font-medium">Storyboard Image</span>
                                    </div>
                                </div>

                                {/* 2. End Frame (Optional) */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono text-gray-500 w-8 text-right">END</span>
                                    
                                    {/* Check for End Frame in startEndAssetIds[1] */}
                                    {(() => {
                                        const endFrameId = scene.startEndAssetIds?.[1];
                                        if (endFrameId) {
                                            const asset = assets.find(a => a.id === endFrameId);
                                            return (
                                                <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-1 text-[10px] text-blue-200 flex-1 animate-fadeIn justify-between group/end">
                                                    <div className="flex items-center gap-1 overflow-hidden">
                                                        <LinkIcon className="w-3 h-3 opacity-70 flex-shrink-0" />
                                                        <span className="truncate" title={asset?.name || endFrameId}>{asset?.name || endFrameId}</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => handleRemoveAsset(endFrameId, 'video')}
                                                        className="hover:text-white transition-colors p-0.5 rounded hover:bg-white/10"
                                                        title="Remove End Frame"
                                                    >
                                                        <X className="w-3 h-3" /> 
                                                    </button>
                                                </div>
                                            );
                                        } else {
                                            return (
                                                <button 
                                                    onClick={() => setActiveAssetSelector('video')}
                                                    className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded px-1.5 py-1 text-[10px] text-gray-400 hover:text-white transition-all flex-1 border-dashed"
                                                    title="Add End Frame Asset"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                    <span>Add End Frame</span>
                                                </button>
                                            );
                                        }
                                    })()}
                                </div>
                            </div>
                        ) : (
                            /* --- STANDARD MODE UI --- */
                            <div className="flex flex-wrap gap-2">
                                {(() => {
                                    const displayIds = scene.videoAssetIds || [];
                                    return (
                                        <>
                                            {displayIds.length === 0 && (
                                                <span className="text-[10px] text-gray-600 italic py-0.5 self-center">No references</span>
                                            )}
                                            {displayIds.map(assetId => {
                                                if (assetId === `scene_img_${scene.id}`) {
                                                    return (
                                                        <div key={assetId} className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 rounded px-1.5 py-0.5 text-[10px] text-green-200 animate-fadeIn">
                                                            <ImageIcon className="w-2.5 h-2.5 opacity-70" />
                                                            <span className="max-w-[80px] truncate" title="Current Scene">Current Scene</span>
                                                            <button 
                                                                onClick={() => handleRemoveAsset(assetId, 'video')}
                                                                className="hover:text-white ml-1 transition-colors"
                                                                title="Remove Reference"
                                                            >
                                                                <X className="w-2.5 h-2.5" /> 
                                                            </button>
                                                        </div>
                                                    );
                                                }

                                                const asset = assets.find(a => a.id === assetId);
                                                if (!asset) return null;

                                                return (
                                                    <div key={assetId} className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5 text-[10px] text-blue-200 animate-fadeIn">
                                                        <LinkIcon className="w-2.5 h-2.5 opacity-70" />
                                                        <span className="max-w-[80px] truncate" title={asset?.name || assetId}>{asset?.name || assetId}</span>
                                                        <button 
                                                            onClick={() => handleRemoveAsset(assetId, 'video')}
                                                            className="hover:text-white ml-1 transition-colors"
                                                            title="Remove Reference"
                                                        >
                                                            <X className="w-2.5 h-2.5" /> 
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            <button 
                                                onClick={() => setActiveAssetSelector('video')}
                                                className={`flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white transition-all ${(displayIds.length >= 3) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                title={(displayIds.length >= 3) ? "Max 3 assets for video" : "Add Reference Image"}
                                                disabled={displayIds.length >= 3}
                                            >
                                                <Plus className="w-2.5 h-2.5" />
                                                <span>Ref</span>
                                            </button>
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                     </div>
                     ) : (
                         <div className="text-[10px] text-gray-500 italic mb-1 flex items-center gap-1">
                             <ImageIcon className="w-3 h-3" />
                             Generate Storyboard Image first to enable video references.
                         </div>
                     )}

                     <textarea 
                        value={scene.video_prompt || scene.visual_desc}
                        onChange={(e) => {
                            if (scene.video_prompt) {
                                onUpdate(scene.id, 'video_prompt', e.target.value);
                            } else {
                                onUpdate(scene.id, 'visual_desc', e.target.value);
                            }
                        }}
                        className={`flex-1 w-full p-2 rounded border border-white/5 text-xs resize-none outline-none focus:border-blue-500/30 min-h-[10rem] transition-colors ${
                            scene.video_prompt ? 'bg-green-900/10 text-green-100 border-green-500/20' : 'bg-black/20 text-gray-300'
                        } ${videoPromptUpdating ? 'opacity-50 animate-pulse cursor-wait' : ''}`}
                        placeholder={labels.visualDesc}
                        disabled={videoPromptUpdating}
                     />
                     



                </div>

                {/* 2. RIGHT PANE: IMAGE + DIALOGUE */}
                <div className="flex flex-col h-full divide-y divide-white/5">
                    
                    {/* Top: Image Prompt (flex-1) */}
                    <div className="p-3 flex flex-col gap-2 relative group flex-1">
                         <h4 className="text-[10px] uppercase tracking-widest text-purple-400 font-bold flex justify-between items-center">
                            <span className="flex items-center gap-2"><ImageIcon className="w-3 h-3" /> {labels.imagePromptLabel}</span>
                         </h4>
                         
                         {/* Reference Image IDs List */}
                         <div className="flex flex-wrap gap-2">
                            {(scene.assetIds || []).length === 0 && (
                                <span className="text-[10px] text-gray-600 italic py-0.5 self-center">No references</span>
                            )}
                            {(scene.assetIds || []).map(assetId => {
                                const asset = assets.find(a => a.id === assetId);
                                return (
                                    <div key={assetId} className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5 text-[10px] text-purple-200 animate-fadeIn">
                                        <LinkIcon className="w-2.5 h-2.5 opacity-70" />
                                        <span className="max-w-[80px] truncate" title={asset?.name || assetId}>{asset?.name || assetId}</span>
                                        <button 
                                            onClick={() => handleRemoveAsset(assetId)}
                                            className="hover:text-white ml-1 transition-colors"
                                            title="Remove Reference"
                                        >
                                            <X className="w-2.5 h-2.5" /> 
                                        </button>
                                    </div>
                                );
                            })}
                            <button 
                                onClick={() => setActiveAssetSelector('image')}
                                className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white transition-all"
                                title="Add Reference Image"
                            >
                                <Plus className="w-2.5 h-2.5" />
                                <span>Ref</span>
                            </button>
                         </div>

                         <textarea
                            value={scene.np_prompt}
                            onChange={(e) => onUpdate(scene.id, 'np_prompt', e.target.value)}
                            className={`flex-1 w-full bg-black/20 p-2 rounded border border-white/5 font-mono text-xs text-gray-400 resize-none outline-none focus:border-banana-500/30 min-h-[6rem] transition-all ${promptGenLoading ? 'opacity-50 animate-pulse cursor-wait' : ''}`}
                            disabled={promptGenLoading}
                         />
                    </div>

                    {/* Bottom: Dialogue & Audio Section (Compact) */}
                    <div className="bg-black/20 p-2 h-[120px] overflow-y-auto">
                         <div className="flex items-center justify-between mb-1 sticky top-0 bg-black/20 backdrop-blur-sm z-10">
                             <div className="flex items-center gap-2">
                                <MessageSquare className="w-3 h-3 text-green-400" />
                                <h4 className="text-[10px] font-bold text-gray-300">{labels.dialogueLabel}</h4>
                             </div>
                             <button 
                                onClick={() => {
                                    const newDialogue = [...(scene.audio_dialogue || []), { speaker: 'Role', text: 'Content...' }];
                                    onUpdate(scene.id, 'audio_dialogue', newDialogue);
                                }}
                                className="p-0.5 hover:bg-white/10 rounded text-gray-500 hover:text-green-400 transition-colors"
                                title="Add Dialogue Line"
                             >
                                <Plus className="w-3 h-3" />
                             </button>
                         </div>
                         
                         {/* Dialogue List - Editable */}
                         <div className="space-y-1 mb-1">
                            {scene.audio_dialogue && scene.audio_dialogue.length > 0 ? (
                                scene.audio_dialogue.map((line, idx) => (
                                    <div key={idx} className="flex gap-1 text-[10px] items-center group/line">
                                        <input 
                                            className="font-bold text-banana-500 bg-transparent border-none outline-none w-16 text-right focus:bg-white/5 rounded px-1"
                                            value={line.speaker}
                                            onChange={(e) => {
                                                const newDialogue = [...(scene.audio_dialogue || [])];
                                                newDialogue[idx] = { ...newDialogue[idx], speaker: e.target.value };
                                                onUpdate(scene.id, 'audio_dialogue', newDialogue);
                                            }}
                                        />
                                        <span className="text-gray-500">:</span>
                                        <input 
                                            className="text-gray-400 bg-transparent border-none outline-none flex-1 focus:bg-white/5 rounded px-1"
                                            value={line.text}
                                            onChange={(e) => {
                                                const newDialogue = [...(scene.audio_dialogue || [])];
                                                newDialogue[idx] = { ...newDialogue[idx], text: e.target.value };
                                                onUpdate(scene.id, 'audio_dialogue', newDialogue);
                                            }}
                                        />
                                        <button 
                                            onClick={() => {
                                                const newDialogue = [...(scene.audio_dialogue || [])];
                                                newDialogue.splice(idx, 1);
                                                onUpdate(scene.id, 'audio_dialogue', newDialogue);
                                            }} 
                                            className="opacity-0 group-hover/line:opacity-100 text-red-500/50 hover:text-red-500 transition-opacity p-0.5"
                                        >
                                            <Trash2 className="w-2.5 h-2.5" />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-[10px] text-gray-600 italic pl-2">No dialogue.</div>
                            )}
                         </div>

                         {/* SFX / BGM */}
                         <div className="flex flex-col gap-1 text-[10px] text-gray-500 border-t border-white/5 pt-1 mt-1">
                             <div className="flex items-center gap-2 group/sfx">
                                 <Music className="w-2.5 h-2.5 text-gray-600 group-focus-within/sfx:text-banana-500" />
                                 <span className="w-6 shrink-0 truncate">{labels.sfxLabel}:</span>
                                 <input 
                                    value={scene.audio_sfx || ''} 
                                    onChange={(e) => onUpdate(scene.id, 'audio_sfx', e.target.value)}
                                    className="bg-transparent border-b border-transparent hover:border-white/10 focus:border-banana-500 outline-none flex-1 text-gray-400 transition-colors px-1"
                                    placeholder="SFX..."
                                  />
                             </div>
                             <div className="flex items-center gap-2 group/bgm">
                                 <Music className="w-2.5 h-2.5 text-gray-600 opacity-50 group-focus-within/bgm:text-banana-500 group-focus-within/bgm:opacity-100" />
                                 <span className="w-6 shrink-0 truncate">BGM:</span>
                                 <input 
                                    value={scene.audio_bgm || ''} 
                                    onChange={(e) => onUpdate(scene.id, 'audio_bgm', e.target.value)}
                                    className="bg-transparent border-b border-transparent hover:border-white/10 focus:border-banana-500 outline-none flex-1 text-gray-400 transition-colors px-1"
                                    placeholder="BGM..."
                                  />
                             </div>
                         </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
      
      {activeAssetSelector !== 'none' && (
          <AssetSelector 
            assets={assets}
            selectedIds={activeAssetSelector === 'video' ? (scene.videoAssetIds || []) : (scene.assetIds || [])}
            onSelect={handleAddAsset}
            onClose={() => setActiveAssetSelector('none')}
            onAssetCreated={onAddAsset}
            extraAssets={scene.imageUrl ? [{
                id: `scene_img_${scene.id}`,
                name: "Current Scene",
                description: "The current generated storyboard image for this scene.",
                type: "item", // Using item as a generic type for scene reference
                refImageUrl: scene.imageUrl
            }] : []}
          />
      )}
    </div>
  );
};

export default SceneCard;
