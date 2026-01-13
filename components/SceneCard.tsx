import React, { useState, useEffect, useRef } from 'react';
import { Scene, ImageGenStatus, GlobalStyle, Asset } from '../types';
import { generateSceneImage, generateSpeech, pcmToWav, generateVideo, regenerateScenePrompt } from '../services/gemini';
import { Translation } from '../translations';
import { AssetSelector } from './AssetSelector';
import { Image as ImageIcon, Copy, Aperture, RefreshCw, Download, MessageSquare, Music, Video, Clock, Camera, Zap, Volume2, Mic, Film, Upload, Plus, Trash2, Link as LinkIcon, X } from 'lucide-react';

interface SceneCardProps {
  scene: Scene;
  characterDesc: string;
  labels: Translation;
  onUpdate: (id: string, field: keyof Scene, value: any) => void;
  isGeneratingExternal?: boolean; 
  onGenerateImageOverride?: (scene: Scene) => Promise<string>;
  onImageGenerated?: (id: string, url: string) => void;
  onVideoGenerated?: (id: string, url: string) => void;
  globalStyle: GlobalStyle;
  areAssetsReady?: boolean; // New Prop for workflow enforcement
  assets?: Asset[];
  onAddAsset?: (asset: Asset) => void;
  language?: string;
}

const SceneCard: React.FC<SceneCardProps> = ({ 
    scene, 
    characterDesc, 
    labels, 
    onUpdate, 
    isGeneratingExternal = false,
    onGenerateImageOverride,
    onImageGenerated,
    onVideoGenerated,
    globalStyle,
    areAssetsReady = true,
    assets = [],
    onAddAsset,
    language = 'Chinese'
}) => {
  const [genStatus, setGenStatus] = useState<ImageGenStatus>(ImageGenStatus.IDLE);
  const [videoStatus, setVideoStatus] = useState<ImageGenStatus>(ImageGenStatus.IDLE);
  const [viewMode, setViewMode] = useState<'image' | 'video'>('image');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(scene.narrationAudioUrl || null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isGeneratingRef = useRef(false);
  
  const [useAssets, setUseAssets] = useState(scene.useAssets ?? true);
  const [showAssetSelector, setShowAssetSelector] = useState(false);
  const [promptGenLoading, setPromptGenLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleAddAsset = (assetId: string, newAsset?: Asset) => {
    const currentIds = scene.assetIds || [];
    if (!currentIds.includes(assetId)) {
        updatePromptWithAssets([...currentIds, assetId], newAsset ? [...assets, newAsset] : undefined);
    }
    setShowAssetSelector(false);
  };

  const handleRemoveAsset = (assetId: string) => {
      const currentIds = scene.assetIds || [];
      updatePromptWithAssets(currentIds.filter(id => id !== assetId));
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
          onUpdate(scene.id, 'imageUrl', result);
          setGenStatus(ImageGenStatus.COMPLETED);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Sync prop image/video url with local status
  useEffect(() => {
      if (scene.imageUrl) setGenStatus(ImageGenStatus.COMPLETED);
      if (scene.videoUrl) {
          setVideoStatus(ImageGenStatus.COMPLETED);
          setViewMode('video');
      }
      if (scene.narrationAudioUrl) setAudioUrl(scene.narrationAudioUrl);
  }, [scene.imageUrl, scene.videoUrl, scene.narrationAudioUrl]);


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
    if (!scene.imageUrl) return; // Need image first
    setVideoStatus(ImageGenStatus.GENERATING);
    try {
      const url = await generateVideo(scene.imageUrl, scene, globalStyle.aspectRatio, useAssets ? assets : []);
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
      if (scene.imageUrl) {
          try {
              let href = scene.imageUrl;
              // If it's not a data URL, fetch it as a blob to force download
              if (!scene.imageUrl.startsWith('data:')) {
                  const response = await fetch(scene.imageUrl);
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
              if (href !== scene.imageUrl) {
                  URL.revokeObjectURL(href);
              }
          } catch (e) {
              console.error("Failed to download image", e);
              // Fallback to direct link
              const link = document.createElement('a');
              link.href = scene.imageUrl;
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
    <div className="bg-dark-800 rounded-xl border border-white/10 overflow-hidden shadow-lg hover:border-banana-500/30 transition-colors duration-300">
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
          {scene.imageUrl ? (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              {viewMode === 'video' && scene.videoUrl ? (
                  <video 
                    src={scene.videoUrl} 
                    controls 
                    className="max-w-full max-h-[320px] object-contain"
                  />
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
                    <div className="flex-1 flex gap-2">
                         <input 
                            value={scene.narration}
                            onChange={(e) => onUpdate(scene.id, 'narration', e.target.value)}
                            className="flex-1 bg-transparent border-none text-white font-medium focus:outline-none focus:ring-0 placeholder-gray-600"
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
                    </div>
                </div>
                <audio ref={audioRef} className="hidden" controls />
            </div>

            {/* Middle: Split Prompts (Video & Image) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
                
                {/* 1. Video Specs & Prompt */}
                <div className="p-4 flex flex-col gap-3">
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
                     <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mb-2">
                        <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                           <Clock className="w-3 h-3 text-blue-400"/> 
                           <span className="opacity-50">{labels.durationLabel}:</span>
                           <input value={scene.video_duration || ''} onChange={e => onUpdate(scene.id, 'video_duration', e.target.value)} className="bg-transparent w-full outline-none" placeholder="3s" />
                        </div>
                        <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                           <Camera className="w-3 h-3 text-blue-400"/> 
                           <span className="opacity-50">{labels.lensLabel}:</span>
                           <input value={scene.video_lens || ''} onChange={e => onUpdate(scene.id, 'video_lens', e.target.value)} className="bg-transparent w-full outline-none" placeholder="35mm" />
                        </div>
                        <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                           <Video className="w-3 h-3 text-blue-400"/> 
                           <span className="opacity-50">{labels.cameraLabel}:</span>
                           <input value={scene.video_camera || ''} onChange={e => onUpdate(scene.id, 'video_camera', e.target.value)} className="bg-transparent w-full outline-none" placeholder="Pan" />
                        </div>
                        <div className="bg-blue-500/10 p-1.5 rounded flex items-center gap-2 text-blue-200">
                           <Zap className="w-3 h-3 text-blue-400"/> 
                           <span className="opacity-50">{labels.vfxLabel}:</span>
                           <input value={scene.video_vfx || ''} onChange={e => onUpdate(scene.id, 'video_vfx', e.target.value)} className="bg-transparent w-full outline-none" placeholder="-" />
                        </div>
                     </div>

                     <textarea 
                        value={scene.visual_desc}
                        onChange={(e) => onUpdate(scene.id, 'visual_desc', e.target.value)}
                        className="flex-1 w-full bg-black/20 p-2 rounded border border-white/5 text-xs text-gray-300 resize-none outline-none focus:border-blue-500/30 min-h-[4rem]"
                        placeholder={labels.visualDesc}
                     />
                </div>

                {/* 2. Image Prompt */}
                <div className="p-4 flex flex-col gap-3 relative group">
                     <h4 className="text-[10px] uppercase tracking-widest text-purple-400 font-bold flex justify-between items-center">
                        <span className="flex items-center gap-2"><ImageIcon className="w-3 h-3" /> {labels.imagePromptLabel}</span>
                        <button onClick={() => navigator.clipboard.writeText(scene.np_prompt)} className="text-gray-500 hover:text-white transition-colors" title={labels.copy}><Copy className="w-3 h-3" /></button>
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
                            onClick={() => setShowAssetSelector(true)}
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
                        className={`flex-1 w-full bg-black/20 p-2 rounded border border-white/5 font-mono text-xs text-gray-400 resize-none outline-none focus:border-banana-500/30 min-h-[4rem] transition-all ${promptGenLoading ? 'opacity-50 animate-pulse cursor-wait' : ''}`}
                        disabled={promptGenLoading}
                     />
                </div>
            </div>
            
            {/* Bottom: Dialogue & Audio Section */}
            <div className="border-t border-white/5 bg-black/20 p-3">
                 <div className="flex items-center justify-between mb-2">
                     <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-green-400" />
                        <h4 className="text-xs font-bold text-gray-300">{labels.dialogueLabel}</h4>
                     </div>
                     <button 
                        onClick={() => {
                            const newDialogue = [...(scene.audio_dialogue || []), { speaker: 'Role', text: 'Content...' }];
                            onUpdate(scene.id, 'audio_dialogue', newDialogue);
                        }}
                        className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-green-400 transition-colors"
                        title="Add Dialogue Line"
                     >
                        <Plus className="w-3.5 h-3.5" />
                     </button>
                 </div>
                 
                 {/* Dialogue List - Editable */}
                 <div className="space-y-1 mb-2">
                    {scene.audio_dialogue && scene.audio_dialogue.length > 0 ? (
                        scene.audio_dialogue.map((line, idx) => (
                            <div key={idx} className="flex gap-2 text-xs items-center group/line">
                                <input 
                                    className="font-bold text-banana-500 bg-transparent border-none outline-none w-24 text-right focus:bg-white/5 rounded px-1"
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
                                    className="opacity-0 group-hover/line:opacity-100 text-red-500/50 hover:text-red-500 transition-opacity p-1"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="text-[10px] text-gray-600 italic pl-2">No dialogue. Click + to add.</div>
                    )}
                 </div>

                 {/* SFX / BGM */}
                 <div className="flex flex-col gap-2 text-[10px] text-gray-500 border-t border-white/5 pt-2 mt-2">
                     <div className="flex items-center gap-2 group/sfx">
                         <Music className="w-3 h-3 text-gray-600 group-focus-within/sfx:text-banana-500" />
                         <span className="w-8 shrink-0">{labels.sfxLabel}:</span>
                         <input 
                            value={scene.audio_sfx || ''} 
                            onChange={(e) => onUpdate(scene.id, 'audio_sfx', e.target.value)}
                            className="bg-transparent border-b border-transparent hover:border-white/10 focus:border-banana-500 outline-none flex-1 text-gray-400 transition-colors px-1"
                            placeholder="Sound Effects..."
                          />
                     </div>
                     <div className="flex items-center gap-2 group/bgm">
                         <Music className="w-3 h-3 text-gray-600 opacity-50 group-focus-within/bgm:text-banana-500 group-focus-within/bgm:opacity-100" />
                         <span className="w-8 shrink-0">BGM:</span>
                         <input 
                            value={scene.audio_bgm || ''} 
                            onChange={(e) => onUpdate(scene.id, 'audio_bgm', e.target.value)}
                            className="bg-transparent border-b border-transparent hover:border-white/10 focus:border-banana-500 outline-none flex-1 text-gray-400 transition-colors px-1"
                            placeholder="Background Music..."
                          />
                     </div>
                 </div>
            </div>
        </div>
      </div>
      
      {showAssetSelector && (
          <AssetSelector 
            assets={assets}
            selectedIds={scene.assetIds || []}
            onSelect={handleAddAsset}
            onClose={() => setShowAssetSelector(false)}
            onAssetCreated={onAddAsset}
          />
      )}
    </div>
  );
};

export default SceneCard;
