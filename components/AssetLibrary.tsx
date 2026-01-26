import React, { useState, useRef } from 'react';
import { Asset, GlobalStyle } from '../types';
import { Translation } from '../translations';
import { LazyMedia } from './LazyMedia';
import { Virtuoso } from 'react-virtuoso';
import { User, MapPin, Package, Plus, Trash2, Wand2, Image as ImageIcon, Camera, GitBranch, RefreshCw, Download, ChevronRight, CornerDownRight, Upload, Copy, Pause } from 'lucide-react';
import { generateAssetImage } from '../services/gemini';

interface AssetLibraryProps {
  assets: Asset[];
  onUpdateAsset: (asset: Asset) => void;
  onAddAsset: (asset: Asset) => void;
  onDeleteAsset: (id: string) => void;
  onExtract: () => void;
  isExtracting: boolean;
  labels: Translation;
  hasText: boolean;
  currentStyle: GlobalStyle;
  autoStart?: boolean;
  onBatchComplete?: () => void;
  onImportFromGlobal?: () => void;
}

interface AssetRowProps {
    asset: Asset;
    depth: number;
    hasChildren: boolean;
    childrenCount: number;
    isExpanded: boolean;
    isGenerating: boolean;
    labels: Translation;
    onUpdateAsset: (asset: Asset) => void;
    onAddVariant: (id: string) => void;
    onDeleteAsset: (id: string) => void;
    onToggleExpand: (id: string) => void;
    onGenMetaImage: (asset: Asset, prompt?: string) => void;
    onSaveImage: (url: string, name: string, assetId?: string) => void;
}

const AssetRow: React.FC<AssetRowProps> = ({
    asset,
    depth,
    hasChildren,
    childrenCount,
    isExpanded,
    isGenerating,
    labels,
    onUpdateAsset,
    onAddVariant,
    onDeleteAsset,
    onToggleExpand,
    onGenMetaImage,
    onSaveImage
}) => {
    return (
        <div className={`
            relative flex items-start gap-3 p-3 rounded-lg border border-white/5 
            hover:border-banana-500/30 transition-colors group bg-black/20
            ${depth > 0 ? 'mt-1 border-l-2 border-l-banana-500/20' : 'mt-4'}
        `} style={{ marginLeft: depth > 0 ? `${depth * 12}px` : 0 }}>
            
            {/* Visual Branch Guide for Depth > 0 */}
            {depth > 0 && (
                <CornerDownRight className="absolute -left-4 top-4 w-4 h-4 text-banana-500/30" />
            )}
    
            <div className="shrink-0 flex flex-col items-center gap-2">
                <div className="w-16 h-16 bg-black/40 rounded border border-white/5 flex items-center justify-center overflow-hidden relative group/img cursor-pointer">
                    {(asset.refImageUrl || asset.refImageAssetId) ? (
                        <>
                            <LazyMedia 
                                assetId={asset.refImageAssetId}
                                fallbackUrl={asset.refImageUrl}
                                type="image"
                                alt={asset.name}
                                className="w-full h-full"
                                imgClassName="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                <button disabled={isGenerating} onClick={(e) => { e.stopPropagation(); onGenMetaImage(asset, asset.prompt); }} title={labels.regenerate} className="p-1 hover:text-banana-400 text-white disabled:opacity-50 disabled:cursor-not-allowed"><RefreshCw className="w-3 h-3" /></button>
                                <button onClick={(e) => { e.stopPropagation(); onSaveImage(asset.refImageUrl!, asset.name, asset.refImageAssetId); }} title={labels.saveImage} className="p-1 hover:text-banana-400 text-white"><Download className="w-3 h-3" /></button>
                            </div>
                        </>
                    ) : (
                        asset.type === 'character' ? <User className="w-6 h-6 text-gray-600" /> : 
                        asset.type === 'location' ? <MapPin className="w-6 h-6 text-gray-600" /> :
                        <Package className="w-6 h-6 text-gray-600" />
                    )}
                    
                    {!asset.refImageUrl && (
                            <button
                                onClick={() => onGenMetaImage(asset, asset.prompt)}
                                disabled={isGenerating || !asset.description}
                            className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${!asset.refImageUrl ? 'opacity-100' : 'opacity-0 group-hover/img:opacity-100'}`}
                            title={labels.genRefImage}
                        >
                            {isGenerating ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Camera className="w-5 h-5 text-white/80 hover:text-banana-400" />
                            )}
                        </button>
                    )}
                </div>
                
                <button 
                    onClick={() => {
                        const next = asset.type === 'character' ? 'location' : asset.type === 'location' ? 'item' : 'character';
                        onUpdateAsset({ ...asset, type: next });
                    }}
                    className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/5 ${
                        asset.type === 'character' ? 'text-pink-400' : 
                        asset.type === 'location' ? 'text-blue-400' :
                        'text-yellow-400'
                    }`}
                >
                    {asset.type === 'character' ? 'CHAR' : asset.type === 'location' ? 'LOC' : 'ITEM'}
                </button>
            </div>
    
            <div className="flex-1 min-w-0">
                <div className="flex items-center mb-2 relative">
                    <input 
                        type="text"
                        value={asset.name}
                        onChange={(e) => onUpdateAsset({ ...asset, name: e.target.value })}
                        placeholder={labels.assetNamePlaceholder}
                        className="flex-1 bg-transparent border-none text-sm font-semibold text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-banana-500/50 rounded px-1 pr-14"
                    />
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-dark-800/80 rounded backdrop-blur-sm">
                        <button onClick={() => onAddVariant(asset.id)} className="text-gray-500 hover:text-banana-400 p-1" title="Add Variant">
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => onDeleteAsset(asset.id)} className="text-gray-500 hover:text-red-400 p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
                <div className="text-[10px] text-gray-500 font-mono mb-1 select-all cursor-pointer flex items-center gap-2">
                    <span className="bg-white/5 px-1 rounded">ID: {asset.id}</span>
                    {hasChildren && (
                        <button onClick={() => onToggleExpand(asset.id)} className="flex items-center gap-1 text-banana-500 hover:text-banana-400">
                            {isExpanded ? <ChevronDownIcon className="w-3 h-3"/> : <ChevronRight className="w-3 h-3"/>}
                            {childrenCount} Variants
                        </button>
                    )}
                </div>
                <textarea 
                        value={asset.description}
                        onChange={(e) => onUpdateAsset({ ...asset, description: e.target.value })}
                        placeholder={labels.assetDescPlaceholder}
                        rows={3}
                        className="w-full bg-black/30 text-gray-300 text-xs p-2 rounded border border-white/5 resize-none focus:outline-none focus:border-banana-500/30 scrollbar-thin"
                />
                
                {/* Prompt Field */}
                <div className="mt-2 bg-black/20 p-2 rounded border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-gray-500 font-bold uppercase flex items-center gap-1">
                            <Wand2 className="w-3 h-3" /> Prompt
                        </label>
                        {asset.prompt && (
                            <button onClick={() => navigator.clipboard.writeText(asset.prompt!)} className="text-gray-500 hover:text-white" title="Copy Prompt">
                                <Copy className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <textarea 
                        value={asset.prompt || ''}
                        onChange={(e) => onUpdateAsset({ ...asset, prompt: e.target.value })}
                        placeholder="Prompt used for generation..."
                        rows={2}
                        className="w-full bg-transparent text-gray-400 font-mono text-[10px] resize-none focus:outline-none focus:text-gray-300 scrollbar-thin"
                    />
                </div>
    
                    <div className="mt-1 flex justify-end">
                        <label className="text-[10px] text-gray-500 hover:text-banana-400 cursor-pointer flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" /> Update Image
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                const file = e.target.files?.[0];
                                if(file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => onUpdateAsset({ ...asset, refImageUrl: ev.target?.result as string });
                                    reader.readAsDataURL(file);
                                }
                            }}/>
                        </label>
                    </div>
            </div>
        </div>
    );
};

const AssetLibrary: React.FC<AssetLibraryProps> = ({ 
  assets, 
  onUpdateAsset,
  onAddAsset,
  onDeleteAsset,
  onExtract, 
  isExtracting, 
  labels,
  hasText,
  currentStyle,
  autoStart = false,
  onBatchComplete,
  onImportFromGlobal
}) => {
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const stopBatchRef = useRef(false);

  // Auto-start mechanism
  React.useEffect(() => {
    if (autoStart && !isBatchGenerating) {
        // Delay slightly to ensure assets are ready
        const t = setTimeout(() => {
            handleBatchGenerate();
        }, 500);
        return () => clearTimeout(t);
    }
  }, [autoStart]);

  // Helper to toggle expansion
  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedIds(newSet);
  };

  const addAsset = (parentId?: string, parentIdString?: string) => {
    // Naming convention: If parent exists, ChildID = ParentID + "_variant" + unique_suffix
    const baseId = parentIdString || `custom_${Date.now()}`;
    const newId = parentId ? `${baseId}_variant_${Date.now()}` : baseId;
    
    const newAsset: Asset = {
      id: newId,
      name: '',
      description: '',
      type: 'character',
      parentId: parentId
    };
    onAddAsset(newAsset);
    if (parentId) {
        // Auto expand parent to show new child
        const newSet = new Set(expandedIds);
        newSet.add(parentId);
        setExpandedIds(newSet);
    }
  };

  const handleGenMetaImage = async (asset: Asset, overridePrompt?: string) => {
      setGeneratingIds(prev => {
          const next = new Set(prev);
          next.add(asset.id);
          return next;
      });
      try {
        // Find parent reference image for consistency
        const parentAsset = asset.parentId ? assets.find(a => a.id === asset.parentId) : undefined;
        let referenceImage = parentAsset?.refImageUrl;
        if (!referenceImage && parentAsset?.refImageAssetId) {
             const { loadAssetUrl } = await import('../services/storage');
             referenceImage = await loadAssetUrl(parentAsset.refImageAssetId) || undefined;
        }

        const { imageUrl, prompt } = await generateAssetImage(asset, currentStyle, overridePrompt, referenceImage);
        onUpdateAsset({ ...asset, refImageUrl: imageUrl, prompt });
      } catch (e) {
          console.error("Meta Image Error", e);
      } finally {
          setGeneratingIds(prev => {
              const next = new Set(prev);
              next.delete(asset.id);
              return next;
          });
      }
  };

  const handleBatchGenerate = async () => {
      if (isBatchGenerating) {
          stopBatchRef.current = true;
          return;
      }

      const missing = assets.filter(a => !a.refImageUrl && !a.refImageAssetId && a.description);
      if (missing.length === 0) {
          if (onBatchComplete && !stopBatchRef.current) {
             onBatchComplete();
          }
          return;
      }

      setIsBatchGenerating(true);
      stopBatchRef.current = false;

      const concurrency = 10;
      let index = 0;

      const runNext = async (): Promise<void> => {
          if (stopBatchRef.current) return;
          const asset = missing[index++];
          if (!asset) return;

          setGeneratingIds(prev => {
              const next = new Set(prev);
              next.add(asset.id);
              return next;
          });
          try {
              const parentAsset = asset.parentId ? assets.find(a => a.id === asset.parentId) : undefined;
              let referenceImage = parentAsset?.refImageUrl;
              if (!referenceImage && parentAsset?.refImageAssetId) {
                 const { loadAssetUrl } = await import('../services/storage');
                 referenceImage = await loadAssetUrl(parentAsset.refImageAssetId) || undefined;
              }

              const { imageUrl, prompt } = await generateAssetImage(asset, currentStyle, undefined, referenceImage);
              onUpdateAsset({ ...asset, refImageUrl: imageUrl, prompt });
          } catch (e) {
              console.error(`Failed to gen image for ${asset.name}`, e);
          } finally {
              setGeneratingIds(prev => {
                  const next = new Set(prev);
                  next.delete(asset.id);
                  return next;
              });
          }

          if (!stopBatchRef.current) {
              await runNext();
          }
      };

      try {
          const workers: Promise<void>[] = [];
          const workerCount = Math.min(concurrency, missing.length);
          for (let i = 0; i < workerCount; i++) {
              workers.push(runNext());
          }
          await Promise.all(workers);
      } finally {
          setIsBatchGenerating(false);
          if (onBatchComplete && !stopBatchRef.current) {
              onBatchComplete();
          }
      }
  };

  const handleSaveImage = async (url: string, name: string, assetId?: string) => {
      try {
          let href = url;
          // If no URL but assetId exists, load it
          if (!href && assetId) {
              const { loadAssetUrl } = await import('../services/storage');
              const loaded = await loadAssetUrl(assetId);
              if (loaded) href = loaded;
          }

          if (!href) return;

          // If it's not a data URL, fetch it as a blob to force download
          if (!href.startsWith('data:')) {
              const response = await fetch(href);
              const blob = await response.blob();
              href = URL.createObjectURL(blob);
          }

          const link = document.createElement('a');
          link.href = href;
          link.download = `asset_${name}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Cleanup blob URL if created
          if (href !== url) {
              URL.revokeObjectURL(href);
          }
      } catch (e) {
          console.error("Failed to download asset image", e);
          // Fallback if href is valid
          if (url) {
            const link = document.createElement('a');
            link.href = url;
            link.download = `asset_${name}.png`;
            link.target = "_blank";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
      }
  };

  const handleUploadAsset = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
          const imageUrl = ev.target?.result as string;
          const newAsset: Asset = {
              id: `upload_${Date.now()}`,
              name: file.name.split('.')[0],
              description: 'Uploaded asset',
              type: 'character',
              refImageUrl: imageUrl
          };
          onAddAsset(newAsset);
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // Reset input
  };

  // Flatten assets for virtualization
  const assetIds = new Set(assets.map(a => a.id));
  const rootAssets = assets.filter(a => !a.parentId || !assetIds.has(a.parentId));

  const flatAssets = React.useMemo(() => {
      const result: { asset: Asset; depth: number }[] = [];
      const traverse = (asset: Asset, depth: number) => {
          result.push({ asset, depth });
          if (expandedIds.has(asset.id)) {
              const children = assets.filter(a => a.parentId === asset.id);
              children.forEach(child => traverse(child, depth + 1));
          }
      };
      rootAssets.forEach(root => traverse(root, 0));
      return result;
  }, [assets, expandedIds, rootAssets]);



  return (
    <div className="flex flex-col h-full bg-dark-800 border-x border-b border-white/10 rounded-b-xl overflow-hidden shadow-xl">
       <div className="bg-white/5 p-4 border-b border-white/10 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            {labels.assetsTitle}
            <span className="bg-banana-500/20 text-banana-500 text-[10px] px-1.5 py-0.5 rounded-full">{assets.length}</span>
          </h2>
          <div className="flex gap-2">
            <label className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-gray-300 transition-colors cursor-pointer" title="Upload Asset">
                <Upload className="w-4 h-4" />
                <input type="file" className="hidden" accept="image/*" onChange={handleUploadAsset} />
            </label>
            <button onClick={handleBatchGenerate} className={`p-1.5 rounded-lg transition-colors ${isBatchGenerating ? 'bg-banana-500 text-black hover:bg-banana-400' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`} title={isBatchGenerating ? "暂停生成" : labels.genMissing}>
                {isBatchGenerating ? <Pause className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            </button>
            {onImportFromGlobal && (
                <button onClick={onImportFromGlobal} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-gray-300 transition-colors" title="Add Reference Image">
                    <Package className="w-4 h-4" />
                </button>
            )}
            <button onClick={() => addAsset()} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-gray-300 transition-colors" title={labels.addAsset}>
                <Plus className="w-4 h-4" />
            </button>
          </div>
       </div>

       <div className="flex-1 overflow-hidden relative">
          <Virtuoso
             data={flatAssets}
             components={{
                 Header: () => (
                     <div className="p-4 pb-0">
                         <div className="bg-gradient-to-br from-banana-900/20 to-transparent p-4 rounded-xl border border-banana-500/20 text-center mb-4">
                            <p className="text-xs text-banana-100/70 mb-3">{labels.autoExtractTip}</p>
                            <button
                                onClick={onExtract}
                                disabled={isExtracting || !hasText}
                                className={`w-full py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${isExtracting || !hasText ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-banana-500 hover:bg-banana-400 text-dark-900 shadow-lg shadow-banana-500/20'}`}
                            >
                                {isExtracting ? <><div className="w-4 h-4 border-2 border-dark-900 border-t-transparent rounded-full animate-spin" />{labels.extracting}</> : <><Wand2 className="w-4 h-4" />{labels.extractAssets}</>}
                            </button>
                         </div>
                         {assets.length === 0 && !isExtracting && <div className="text-center py-8 text-gray-600 text-xs italic">{labels.noAssets}</div>}
                     </div>
                 ),
                 Footer: () => <div className="h-4" />
             }}
             itemContent={(index, item) => {
                 const childrenCount = assets.filter(a => a.parentId === item.asset.id).length;
                 const hasChildren = childrenCount > 0;
                 const isExpanded = expandedIds.has(item.asset.id);
                 return (
                 <div className="px-4 pb-1">
                    <AssetRow 
                        asset={item.asset} 
                        depth={item.depth}
                        hasChildren={hasChildren}
                        childrenCount={childrenCount}
                        isExpanded={isExpanded}
                        isGenerating={generatingIds.has(item.asset.id)}
                        labels={labels}
                        onUpdateAsset={onUpdateAsset}
                        onAddVariant={(id) => addAsset(id, id)}
                        onDeleteAsset={onDeleteAsset}
                        onToggleExpand={toggleExpand}
                        onGenMetaImage={handleGenMetaImage}
                        onSaveImage={handleSaveImage}
                    />
                 </div>
             )}}
          />
       </div>
    </div>
  );
};

// Simple icon for toggle
const ChevronDownIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6"/></svg>
);

export default AssetLibrary;
