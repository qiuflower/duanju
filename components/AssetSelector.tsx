import React, { useRef } from 'react';
import { Asset } from '../types';
import { X, Search, Upload } from 'lucide-react';

interface AssetSelectorProps {
  assets: Asset[];
  onSelect: (assetId: string, asset?: Asset) => void;
  onClose: () => void;
  onAssetCreated?: (asset: Asset) => void;
  selectedIds?: string[];
  extraAssets?: Asset[]; // New prop for temporary assets like current scene image
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({ assets, onSelect, onClose, onAssetCreated, selectedIds = [], extraAssets = [] }) => {
  const [search, setSearch] = React.useState('');
  const [pendingUpload, setPendingUpload] = React.useState<{ base64: string; name: string } | null>(null);
  const [newAssetInfo, setNewAssetInfo] = React.useState<{ name: string; description: string; type: Asset['type'] }>({
      name: '',
      description: '',
      type: 'character'
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combine regular assets with extra assets (ensuring no duplicates if IDs clash)
  const allAssets = [...extraAssets, ...assets];
  
  const filteredAssets = allAssets.filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase()) || 
    a.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const base64 = event.target?.result as string;
          setPendingUpload({ base64, name: file.name.split('.')[0] });
          setNewAssetInfo({
              name: file.name.split('.')[0],
              description: '',
              type: 'character'
          });
      };
      reader.readAsDataURL(file);
      // Reset input so same file can be selected again if cancelled
      e.target.value = '';
  };

  const handleConfirmUpload = () => {
      if (!pendingUpload) return;

      const newAsset: Asset = {
          id: `custom_${Date.now()}`,
          name: newAssetInfo.name || pendingUpload.name,
          description: newAssetInfo.description || 'Custom uploaded reference image',
          type: newAssetInfo.type,
          refImageUrl: pendingUpload.base64
      };

      if (onAssetCreated) {
          onAssetCreated(newAsset);
          onSelect(newAsset.id, newAsset);
      }
      setPendingUpload(null);
  };

  if (pendingUpload) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-white/10 rounded-xl w-full max-w-md p-6 shadow-2xl space-y-4">
                <h3 className="text-lg font-bold text-white">New Asset Details</h3>
                
                <div className="flex justify-center bg-black/40 rounded-lg p-4 border border-white/5">
                    <img src={pendingUpload.base64} alt="Preview" className="h-40 object-contain rounded" />
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Name</label>
                        <input 
                            value={newAssetInfo.name}
                            onChange={e => setNewAssetInfo(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-banana-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Type</label>
                        <select 
                            value={newAssetInfo.type}
                            onChange={e => setNewAssetInfo(prev => ({ ...prev, type: e.target.value as any }))}
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-banana-500 outline-none"
                        >
                            <option value="character">Character</option>
                            <option value="location">Location</option>
                            <option value="item">Item</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Description</label>
                        <textarea 
                            value={newAssetInfo.description}
                            onChange={e => setNewAssetInfo(prev => ({ ...prev, description: e.target.value }))}
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-banana-500 outline-none h-24 resize-none"
                            placeholder="Describe this asset for the AI..."
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button 
                        onClick={() => setPendingUpload(null)}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleConfirmUpload}
                        className="px-4 py-2 bg-banana-500 text-black font-bold rounded hover:bg-banana-400 transition-colors"
                    >
                        Create Asset
                    </button>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-white/10 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Select Reference Asset</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 border-b border-white/10 flex gap-2">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search assets..."
                    className="w-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-banana-500 focus:outline-none transition-colors"
                    autoFocus
                />
            </div>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleUpload} 
                className="hidden" 
                accept="image/*"
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center gap-2 transition-colors text-sm font-medium whitespace-nowrap"
            >
                <Upload className="w-4 h-4" />
                Upload
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filteredAssets.map(asset => {
            const isSelected = selectedIds.includes(asset.id);
            return (
                <button
                    key={asset.id}
                    onClick={() => onSelect(asset.id)}
                    disabled={isSelected}
                    className={`group relative aspect-square rounded-lg overflow-hidden border transition-all text-left ${
                        isSelected 
                        ? 'border-banana-500 opacity-50 cursor-not-allowed' 
                        : 'border-white/5 hover:border-banana-500/50 hover:scale-[1.02]'
                    }`}
                >
                    {asset.refImageUrl ? (
                        <img src={asset.refImageUrl} alt={asset.name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-white/5 flex items-center justify-center text-gray-500 text-xs">
                            No Image
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-3 flex flex-col justify-end">
                        <div className="text-xs font-bold text-white truncate">{asset.name}</div>
                        <div className="text-[10px] text-gray-400 capitalize">{asset.type}</div>
                    </div>
                    {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <span className="text-banana-500 font-bold text-xs bg-black/80 px-2 py-1 rounded">Selected</span>
                        </div>
                    )}
                </button>
            );
          })}
          {filteredAssets.length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-500 text-xs">
                  No assets found.
              </div>
          )}
        </div>
      </div>
    </div>
  );
};
