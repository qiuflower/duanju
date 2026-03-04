import React from 'react';
import { Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { LazyMedia } from '@/ui/common/LazyMedia';
import { User, MapPin, Package, Plus, Trash2, Wand2, Image as ImageIcon, Camera, RefreshCw, Download, ChevronRight, CornerDownRight, Copy } from 'lucide-react';

export interface AssetRowProps {
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

// Simple icon for toggle
const ChevronDownIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>
);

const AssetRow: React.FC<AssetRowProps> = ({
    asset, depth, hasChildren, childrenCount, isExpanded, isGenerating,
    labels, onUpdateAsset, onAddVariant, onDeleteAsset, onToggleExpand,
    onGenMetaImage, onSaveImage
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
                    className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/5 ${asset.type === 'character' ? 'text-pink-400' :
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
                            {isExpanded ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
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
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => onUpdateAsset({ ...asset, refImageUrl: ev.target?.result as string });
                                reader.readAsDataURL(file);
                            }
                        }} />
                    </label>
                </div>
            </div>
        </div>
    );
};

export default AssetRow;
