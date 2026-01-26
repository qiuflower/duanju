import React, { useState, useRef } from 'react';
import { GlobalStyle, StyleSetting } from '../types';
import { Translation } from '../translations';
import { Dices, Info, RectangleHorizontal, RectangleVertical, Mic, Volume2, Upload, X, Sparkles, Image as ImageIcon } from 'lucide-react';
import { generateStyleOptions, VOICE_OPTIONS, generateSpeech, pcmToWav, analyzeVisualStyleFromImages } from '../services/gemini';

interface StylePanelProps {
  styleState: GlobalStyle;
  onStyleChange: (newStyle: GlobalStyle) => void;
  labels: Translation;
  language?: string;
}

const StylePanel: React.FC<StylePanelProps> = ({ styleState, onStyleChange, labels, language = "Chinese" }) => {
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Image Upload State
  const [uploadImages, setUploadImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const remainingSlots = 10 - uploadImages.length;
      if (remainingSlots <= 0) return;

      const filesToProcess = Array.from(files).slice(0, remainingSlots);
      
      filesToProcess.forEach((file: File) => {
          const reader = new FileReader();
          reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                  setUploadImages(prev => [...prev, reader.result as string]);
              }
          };
          reader.readAsDataURL(file);
      });
      
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
      setUploadImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyzeImages = async () => {
      if (uploadImages.length === 0) return;
      setIsAnalyzing(true);
      try {
          const dna = await analyzeVisualStyleFromImages(uploadImages, language);
          if (dna) {
              onStyleChange({
                  ...styleState,
                  visualTags: dna, // Update Visual DNA
                  texture: {
                      ...styleState.texture,
                      custom: dna // Also put it in custom texture field for visibility
                  }
              });
          }
      } catch (e) {
          console.error("Analysis failed", e);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleRollDice = async (type: 'director' | 'work' | 'texture') => {
    setLoadingType(type);
    const newSeed = Math.floor(1000 + Math.random() * 9000).toString();
    
    try {
        const newOptions = await generateStyleOptions(type, newSeed, language);
        let mergedOptions = newOptions;
        if (type === 'texture' && newOptions.length < 20) {
            const defaults = ["Realistic", "2D", "2.5D", "3D", "Ink", "Clay", "Oil Painting", "Paper Cut"];
            mergedOptions = [...new Set([...defaults, ...newOptions])].slice(0, 20); 
        }

        onStyleChange({
            ...styleState,
            [type]: {
                ...styleState[type],
                seed: newSeed,
                options: mergedOptions,
                selected: 'None'
            }
        });
    } catch (e) {
        console.error("Dice error", e);
    } finally {
        setLoadingType(null);
    }
  };

  const updateSetting = (type: 'director' | 'work' | 'texture', field: keyof StyleSetting, value: any) => {
      onStyleChange({
          ...styleState,
          [type]: {
              ...styleState[type],
              [field]: value
          }
      });
  };

  const handleVoicePreview = async () => {
      const voiceId = styleState.narrationVoice || "Kore";
      setPreviewingVoice(voiceId);
      try {
          // Short phrase for preview
          const text = language === "Chinese" 
             ? "这是一个声音测试，用于旁白配音预览。" 
             : "This is a voice test for narration preview.";
             
          const base64 = await generateSpeech(text, voiceId);
          
          const binaryString = atob(base64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
          }
          const wavBlob = pcmToWav(bytes.buffer, 24000, 1);
          const url = URL.createObjectURL(wavBlob);
          
          if (audioRef.current) {
              audioRef.current.src = url;
              audioRef.current.play();
          }
      } catch (e) {
          console.error("Voice preview failed", e);
      } finally {
          setPreviewingVoice(null);
      }
  };

  const renderSection = (
      type: 'director' | 'work' | 'texture', 
      title: string, 
      hint: string,
      current: StyleSetting,
      placeholder: string
  ) => {
    return (
        <div className="bg-white/5 rounded-lg p-4 border border-white/5 hover:border-banana-500/20 transition-all">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-banana-400 text-sm">{title}</h3>
                    <div className="group relative">
                        <Info className="w-3 h-3 text-gray-500 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 w-48 bg-black/90 text-gray-300 text-[10px] p-2 rounded hidden group-hover:block z-50 pointer-events-none">
                            {hint}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                     <span className="text-[10px] font-mono text-gray-500">SEED: {current.seed}</span>
                     <button 
                        onClick={() => handleRollDice(type)}
                        disabled={loadingType === type}
                        className={`p-1.5 rounded-md bg-banana-500/20 text-banana-500 hover:bg-banana-500 hover:text-black transition-colors ${loadingType === type ? 'animate-spin' : ''}`}
                        title={labels.randomize}
                     >
                        <Dices className="w-4 h-4" />
                     </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {/* Custom Input */}
                <input 
                    type="text"
                    placeholder={placeholder}
                    value={current.custom || ''}
                    onChange={(e) => updateSetting(type, 'custom', e.target.value)}
                    className="w-full bg-black/40 text-sm text-banana-100 placeholder-gray-600 p-2 rounded border border-white/10 focus:border-banana-500/50 outline-none"
                />

                {/* Dropdown Selector */}
                <select 
                    value={current.selected}
                    onChange={(e) => updateSetting(type, 'selected', e.target.value)}
                    className="w-full bg-black/30 text-sm text-gray-400 p-2 rounded border border-white/10 focus:border-banana-500/50 outline-none"
                    disabled={!!current.custom} 
                >
                    <option value="None">{labels.none}</option>
                    {current.options.map((opt, i) => (
                        <option key={i} value={opt}>{opt}</option>
                    ))}
                </select>

                {/* Slider */}
                <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-gray-500 uppercase">{labels.strength}</span>
                    <input 
                        type="range" 
                        min="1" 
                        max="10" 
                        step="1"
                        value={current.strength}
                        onChange={(e) => updateSetting(type, 'strength', parseInt(e.target.value))}
                        className="flex-1 accent-banana-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs font-mono w-4 text-right">{current.strength}</span>
                </div>

                {/* Checkbox for Reference Work only */}
                {type === 'work' && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                         <input 
                            type="checkbox"
                            id="useOriginalCharacters"
                            checked={current.useOriginalCharacters || false}
                            onChange={(e) => updateSetting(type, 'useOriginalCharacters', e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-gray-600 text-banana-500 focus:ring-banana-500 bg-gray-700/50 cursor-pointer accent-banana-500"
                         />
                         <label htmlFor="useOriginalCharacters" className="text-xs text-gray-400 select-none cursor-pointer hover:text-banana-400 transition-colors">
                            {language === 'Chinese' ? '影视剧人物/场景/物品1:1还原' : '1:1 Restore Characters/Scenes/Items'}
                         </label>
                         <div className="group relative ml-1">
                            <Info className="w-3 h-3 text-gray-600 cursor-help" />
                            <div className="absolute left-0 bottom-full mb-2 w-48 bg-black/90 text-gray-300 text-[10px] p-2 rounded hidden group-hover:block z-50 pointer-events-none">
                                {language === 'Chinese' 
                                    ? '若勾选，系统会自动识别剧本中出现的角色、场景及物品，并在生成资产时自动添加"影视剧《作品名》... 1:1还原"及原影视造型的提示词。' 
                                    : 'If checked, system will detect characters, scenes, and items, and append "Movie/TV Series《Work》... 1:1 Restore" and original film/TV styling details to asset prompts.'}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Image Upload for Texture */}
            {type === 'texture' && (
                <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" />
                            Style Ref ({uploadImages.length}/10)
                        </span>
                        {uploadImages.length > 0 && (
                            <button 
                                onClick={handleAnalyzeImages}
                                disabled={isAnalyzing}
                                className="flex items-center gap-1 text-[10px] bg-banana-500 text-black px-2 py-1 rounded hover:bg-banana-400 transition-colors disabled:opacity-50"
                            >
                                {isAnalyzing ? <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin"/> : <Sparkles className="w-3 h-3" />}
                                Analyze
                            </button>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-5 gap-2 mb-2">
                        {uploadImages.map((img, idx) => (
                            <div key={idx} className="relative aspect-square rounded overflow-hidden group border border-white/10">
                                <img src={img} alt="ref" className="w-full h-full object-cover" />
                                <button 
                                    onClick={() => removeImage(idx)}
                                    className="absolute top-0 right-0 p-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-bl"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        {uploadImages.length < 10 && (
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="aspect-square rounded border border-dashed border-white/20 flex items-center justify-center hover:border-banana-500/50 hover:bg-white/5 transition-colors"
                                title="Upload Reference Image"
                            >
                                <Upload className="w-4 h-4 text-gray-500" />
                            </button>
                        )}
                    </div>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        multiple 
                        onChange={handleImageUpload} 
                    />
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-dark-800 border-x border-b border-white/10 rounded-b-xl overflow-hidden shadow-xl p-4 space-y-4 overflow-y-auto">
        {/* Aspect Ratio Selector */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/5 hover:border-banana-500/20 transition-all">
            <div className="flex items-center gap-2 mb-3">
                 <h3 className="font-bold text-banana-400 text-sm">{labels.aspectRatio}</h3>
                 <div className="group relative">
                        <Info className="w-3 h-3 text-gray-500 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 w-48 bg-black/90 text-gray-300 text-[10px] p-2 rounded hidden group-hover:block z-50 pointer-events-none">
                            {labels.arHint}
                        </div>
                 </div>
            </div>
            <div className="flex gap-2">
                <button
                   onClick={() => onStyleChange({ ...styleState, aspectRatio: '16:9' })}
                   className={`flex-1 flex flex-col items-center gap-1 p-2 rounded border ${styleState.aspectRatio === '16:9' ? 'bg-banana-500 text-black border-banana-500' : 'bg-black/20 text-gray-400 border-white/10 hover:border-white/30'}`}
                >
                   <RectangleHorizontal className="w-5 h-5" />
                   <span className="text-xs font-bold">16:9</span>
                </button>
                <button
                   onClick={() => onStyleChange({ ...styleState, aspectRatio: '9:16' })}
                   className={`flex-1 flex flex-col items-center gap-1 p-2 rounded border ${styleState.aspectRatio === '9:16' ? 'bg-banana-500 text-black border-banana-500' : 'bg-black/20 text-gray-400 border-white/10 hover:border-white/30'}`}
                >
                   <RectangleVertical className="w-5 h-5" />
                   <span className="text-xs font-bold">9:16</span>
                </button>
            </div>
        </div>

        {/* Voice Selector */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/5 hover:border-banana-500/20 transition-all">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-banana-400 text-sm">{labels.voiceStyle}</h3>
                    <div className="group relative">
                        <Info className="w-3 h-3 text-gray-500 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 w-48 bg-black/90 text-gray-300 text-[10px] p-2 rounded hidden group-hover:block z-50 pointer-events-none">
                            {labels.voiceHint}
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex gap-2">
                <select 
                    value={styleState.narrationVoice}
                    onChange={(e) => onStyleChange({...styleState, narrationVoice: e.target.value})}
                    className="flex-1 bg-black/30 text-sm text-gray-400 p-2 rounded border border-white/10 focus:border-banana-500/50 outline-none"
                >
                    {VOICE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                </select>
                <button 
                    onClick={handleVoicePreview}
                    disabled={!!previewingVoice}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded text-gray-300"
                    title={labels.previewVoice}
                >
                    {previewingVoice ? <div className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" /> : <Volume2 className="w-4 h-4" />}
                </button>
            </div>
            <audio ref={audioRef} className="hidden" />
        </div>

        {renderSection('director', labels.directorStyle, labels.directorHint, styleState.director, labels.customPlaceholder)}
        {renderSection('work', labels.workStyle, labels.workHint, styleState.work, labels.customPlaceholder)}
        {renderSection('texture', labels.textureStyle, labels.textureHint, styleState.texture, labels.customPlaceholder)}
    </div>
  );
};

export default StylePanel;
