import React, { useState } from 'react';
import { Settings, ChevronDown } from 'lucide-react';
import { modelManager, ModelConfig, ProviderType } from '../services/ai/model-manager';

export const ModelSelector: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ModelConfig>(modelManager.getConfig());

  const handleUpdate = (key: keyof ModelConfig, value: ProviderType) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    modelManager.setConfig(newConfig);
  };

  const options: ProviderType[] = ['t8star', 'polo'];

  return (
    <div className="relative z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
        title="Model Settings"
      >
        <Settings size={20} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-transparent" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white mb-2">Model Providers</h3>
            
            {/* Text Model */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Text Model</label>
              <div className="relative">
                <select 
                  value={config.textmodel}
                  onChange={(e) => handleUpdate('textmodel', e.target.value as ProviderType)}
                  className="w-full bg-slate-900 text-white text-sm rounded px-2 py-1 border border-slate-700 focus:border-indigo-500 outline-none appearance-none"
                >
                  {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1.5 text-slate-500 pointer-events-none" size={14} />
              </div>
            </div>

            {/* Image Model */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Image Model</label>
              <div className="relative">
                <select 
                  value={config.imagemodel}
                  onChange={(e) => handleUpdate('imagemodel', e.target.value as ProviderType)}
                  className="w-full bg-slate-900 text-white text-sm rounded px-2 py-1 border border-slate-700 focus:border-indigo-500 outline-none appearance-none"
                >
                  {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                 <ChevronDown className="absolute right-2 top-1.5 text-slate-500 pointer-events-none" size={14} />
              </div>
            </div>

            {/* Video Model */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Video Model</label>
              <div className="relative">
                <select 
                  value={config.videomodel}
                  onChange={(e) => handleUpdate('videomodel', e.target.value as ProviderType)}
                  className="w-full bg-slate-900 text-white text-sm rounded px-2 py-1 border border-slate-700 focus:border-indigo-500 outline-none appearance-none"
                >
                  {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                 <ChevronDown className="absolute right-2 top-1.5 text-slate-500 pointer-events-none" size={14} />
              </div>
            </div>
            
          </div>
        </>
      )}
    </div>
  );
};

export default ModelSelector;
