import React, { useState } from 'react';
import { Settings, ChevronDown, PlayCircle, Trash2, X, Box, Type, Image, Video, Sparkles, Maximize, Upload } from 'lucide-react';
import { modelManager, ModelConfig, ProviderType } from '@/services/ai/model-manager';

export const ModelSelector: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ModelConfig>(modelManager.getConfig());

  const handleUpdateString = (key: keyof ModelConfig, value: string) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    modelManager.setConfig(newConfig);
  };

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
          <div className="absolute right-0 mt-2 w-[360px] max-h-[85vh] flex flex-col bg-[#12141A] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="p-5 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

              {/* Top Action Bar */}
              <div className="flex items-center justify-end mb-2">
                <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer" onClick={() => setIsOpen(false)}>
                  <X size={14} className="text-white" />
                </div>
              </div>

              {/* Main Header */}
              <div className="flex items-center space-x-3 mb-6">
                <div className="bg-[#4D58B8] p-2.5 rounded-xl text-white shadow-lg">
                  <Box size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight mb-0.5">Model Providers</h3>
                  <p className="text-[11px] text-slate-400 leading-tight">配置与管理模型服务</p>
                </div>
              </div>

              {/* Cards Container */}
              <div className="space-y-3">

                {/* Text Model Card */}
                <div className="bg-[#1A1D24] border border-white/5 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-[#242832] p-2 rounded-lg text-slate-300">
                      <Type size={16} />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-slate-200 leading-tight mb-0.5">Text Model</div>
                      <div className="text-[10px] text-slate-500 leading-tight">选择用于文本生成的模型</div>
                    </div>
                  </div>
                  <div className="relative w-[110px]">
                    <select
                      value={config.textmodel}
                      onChange={(e) => handleUpdate('textmodel', e.target.value as ProviderType)}
                      className="w-full bg-[#0D0F12] text-slate-200 text-xs rounded-md pl-3 pr-8 py-2 border border-white/5 focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                    >
                      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-[9px] text-slate-500 pointer-events-none" size={14} />
                  </div>
                </div>

                {/* Image Model Main Wrapper */}
                <div className="bg-[#1A1D24] border border-white/5 rounded-xl flex flex-col overflow-hidden">
                  {/* Image Model Base Card */}
                  <div className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-[#242832] p-2 rounded-lg text-slate-300">
                        <Image size={16} />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-slate-200 leading-tight mb-0.5">Image Model</div>
                        <div className="text-[10px] text-slate-500 leading-tight">选择用于图像生成的模型</div>
                      </div>
                    </div>
                    <div className="relative w-[110px]">
                      <select
                        value={config.imagemodel}
                        onChange={(e) => handleUpdate('imagemodel', e.target.value as ProviderType)}
                        className="w-full bg-[#0D0F12] text-slate-200 text-xs rounded-md pl-3 pr-8 py-2 border border-white/5 focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                      >
                        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-[9px] text-slate-500 pointer-events-none" size={14} />
                    </div>
                  </div>

                  {/* T8Star Config Expansion */}
                  {config.imagemodel === 't8star' && (
                    <div className="border-t border-white/5 p-4 pt-4">

                      {/* Left border wrapper to match the image */}
                      <div className="border-l-[3px] border-[#4D58B8] pl-4 flex flex-col space-y-5">

                        {/* T8star Model Select */}
                        <div>
                          <div className="flex items-center space-x-2 text-[#7B8BFF] mb-3">
                            <Sparkles size={14} />
                            <span className="text-[13px] font-semibold">T8star Image Model</span>
                          </div>
                          <div className="relative">
                            <select
                              value={config.t8starImageModel || 'nano-banana-pro'}
                              onChange={(e) => handleUpdateString('t8starImageModel', e.target.value)}
                              className="w-full bg-[#0D0F12] text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-white/5 focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                            >
                              <option value="nano-banana-pro">nano-banana-pro</option>
                              <option value="gpt-image-2">gpt-image-2</option>
                              <option value="gpt-image-2-official">gpt-image-2 (官方版)</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                          </div>
                        </div>

                        {/* T8star Optional Official Size & Quality Settings */}
                        {(config.t8starImageModel === 'gpt-image-2-official' || config.t8starImageModel === 'gpt-image-2') && (
                          <>
                            {/* Size Option */}
                            <div>
                              <div className="flex items-center space-x-3 mb-3">
                                <div className="bg-[#242832] p-1.5 rounded-md text-slate-300">
                                  <Maximize size={15} />
                                </div>
                                <div>
                                  <div className="text-[13px] font-semibold text-slate-200 leading-tight mb-0.5">高级尺寸 (Size)</div>
                                  <div className="text-[10px] text-slate-500 leading-tight">设置图像输出的尺寸</div>
                                </div>
                              </div>

                              <div className="relative mb-3">
                                <select
                                  value={(!['auto', '1024x1024', '1024x1536', '1536x1024', '2048x2048', '2048x1152', '3840x2160', '2160x3840'].includes(config.t8starImageSize || 'auto')) ? 'custom' : (config.t8starImageSize || 'auto')}
                                  onChange={(e) => {
                                    if (e.target.value === 'custom') {
                                      handleUpdateString('t8starImageSize', '2560x1440');
                                    } else {
                                      handleUpdateString('t8starImageSize', e.target.value);
                                    }
                                  }}
                                  className="w-full bg-[#0D0F12] text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-white/5 focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                                >
                                  <option value="auto">Auto (默认)</option>
                                  <option value="1024x1024">1024x1024 (1:1)</option>
                                  <option value="1024x1536">1024x1536 (2:3)</option>
                                  <option value="1536x1024">1536x1024 (3:2)</option>
                                  <option value="2048x2048">2048x2048 (1:1 2K)</option>
                                  <option value="2048x1152">2048x1152 (16:9 2K)</option>
                                  <option value="3840x2160">3840x2160 (16:9 4K)</option>
                                  <option value="2160x3840">2160x3840 (9:16 4K)</option>
                                  <option value="custom">Custom (自定义)</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                              </div>

                              {/* Custom Input boxes */}
                              {(!['auto', '1024x1024', '1024x1536', '1536x1024', '2048x2048', '2048x1152', '3840x2160', '2160x3840'].includes(config.t8starImageSize || 'auto')) && (
                                (() => {
                                  const currentCustomSize = config.t8starImageSize || '';
                                  const match = currentCustomSize.match(/^(\d+)x(\d+)$/i);
                                  const width = match ? match[1] : '';
                                  const height = match ? match[2] : '';

                                  return (
                                    <div className="flex items-center justify-between space-x-3 mb-1">
                                      <input
                                        type="text"
                                        value={width}
                                        onChange={e => handleUpdateString('t8starImageSize', `${e.target.value}x${height || '1440'}`)}
                                        className="w-full bg-[#0D0F12] text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-white/5 focus:border-[#7B8BFF] outline-none font-medium"
                                        placeholder="Width"
                                      />
                                      <span className="text-slate-500 font-medium text-xs">×</span>
                                      <input
                                        type="text"
                                        value={height}
                                        onChange={e => handleUpdateString('t8starImageSize', `${width || '2560'}x${e.target.value}`)}
                                        className="w-full bg-[#0D0F12] text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-white/5 focus:border-[#7B8BFF] outline-none font-medium"
                                        placeholder="Height"
                                      />
                                    </div>
                                  );
                                })()
                              )}

                              {/* Error validation for Custom Size */}
                              {(() => {
                                const currentCustomSize = config.t8starImageSize || '';
                                let hasError = false;
                                let errorMsg = "";

                                const match = currentCustomSize.match(/^(\d+)x(\d+)$/i);
                                if (!match && currentCustomSize !== 'auto' && currentCustomSize !== 'custom' && currentCustomSize !== '') {
                                  hasError = true;
                                  errorMsg = "格式错误";
                                } else if (match) {
                                  const w = parseInt(match[1]);
                                  const h = parseInt(match[2]);
                                  const total = w * h;

                                  if (w < 256 || h < 256) {
                                    hasError = true;
                                    errorMsg = `单边不能低于256px`;
                                  } else if (w > 4096 || h > 4096) {
                                    hasError = true;
                                    errorMsg = `单边不建议超过4096px`;
                                  } else if (total < 655360) {
                                    hasError = true;
                                    errorMsg = `最小像素 655360`;
                                  } else if (total > 8294400) {
                                    hasError = true;
                                    errorMsg = `最大像素 8294400`;
                                  }
                                }
                                return hasError ? <div className="text-red-400 text-[10px] mt-1.5 leading-tight">{errorMsg}</div> : null;
                              })()}
                            </div>

                            {/* Quality Option */}
                            <div>
                              <div className="flex items-center space-x-3 mb-3">
                                <div className="bg-[#242832] p-1.5 rounded-md text-slate-300 font-bold text-[9px] w-[26px] h-[26px] flex items-center justify-center">
                                  HD
                                </div>
                                <div>
                                  <div className="text-[13px] font-semibold text-slate-200 leading-tight mb-0.5">图像质量 (Quality)</div>
                                  <div className="text-[10px] text-slate-500 leading-tight">选择图像生成质量</div>
                                </div>
                              </div>

                              <div className="relative">
                                <select
                                  value={config.t8starImageQuality || 'auto'}
                                  onChange={(e) => handleUpdateString('t8starImageQuality', e.target.value)}
                                  className="w-full bg-[#0D0F12] text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-white/5 focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                                >
                                  <option value="auto">Auto (默认)</option>
                                  <option value="low">Low (低 - 最快)</option>
                                  <option value="medium">Medium (中)</option>
                                  <option value="high">High (高)</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                              </div>
                            </div>

                          </>
                        )}

                        {/* Nano/Gemini Settings */}
                        {(config.t8starImageModel === 'nano-banana-pro') && (
                          <>
                            {/* Nano Size Option */}
                            <div>
                              <div className="flex items-center space-x-3 mb-3">
                                <div className="bg-[#242832] p-1.5 rounded-md text-slate-300">
                                  <Maximize size={15} />
                                </div>
                                <div>
                                  <div className="text-[13px] font-semibold text-slate-200 leading-tight mb-0.5">基础尺寸 (Size)</div>
                                  <div className="text-[10px] text-slate-500 leading-tight">设置图像输出的基础分辨率</div>
                                </div>
                              </div>
                              <div className="relative mb-3">
                                <select
                                  value={config.t8starNanoImageSize || '2K'}
                                  onChange={(e) => handleUpdateString('t8starNanoImageSize', e.target.value)}
                                  className="w-full bg-[#0D0F12] text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-white/5 focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                                >
                                  <option value="1K">1K</option>
                                  <option value="2K">2K</option>
                                  <option value="4K">4K(暂不可用)</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                              </div>
                            </div>

                            {/* Nano Aspect Ratio Option */}
                            <div>
                              <div className="flex items-center space-x-3 mb-3">
                                <div className="bg-[#242832] p-1.5 rounded-md text-slate-300 font-bold text-[9px] w-[26px] h-[26px] flex items-center justify-center">
                                  AR
                                </div>
                                <div>
                                  <div className="text-[13px] font-semibold text-slate-200 leading-tight mb-0.5">生成比例 (Aspect Ratio)</div>
                                  <div className="text-[10px] text-slate-500 leading-tight">设置图像画幅比例</div>
                                </div>
                              </div>
                              <div className="relative">
                                <select
                                  value={config.t8starNanoAspectRatio || '16:9'}
                                  onChange={(e) => handleUpdateString('t8starNanoAspectRatio', e.target.value)}
                                  className="w-full bg-[#0D0F12] text-slate-200 text-xs rounded-lg px-3 py-2.5 border border-white/5 focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                                >
                                  <option value="16:9">16:9</option>
                                  <option value="9:16">9:16</option>
                                  <option value="1:1">1:1</option>
                                  <option value="4:3">4:3</option>
                                  <option value="3:4">3:4</option>
                                  <option value="3:2">3:2</option>
                                  <option value="2:3">2:3</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={14} />
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                    </div>
                  )}
                </div>

                {/* Video Model Card */}
                <div className="bg-[#1A1D24] border border-white/5 rounded-xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-[#242832] p-2 rounded-lg text-slate-300">
                      <Video size={16} />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-slate-200 leading-tight mb-0.5">Video Model</div>
                      <div className="text-[10px] text-slate-500 leading-tight">选择用于视频生成的模型</div>
                    </div>
                  </div>
                  <div className="relative w-[110px]">
                    <select
                      value={config.videomodel}
                      onChange={(e) => handleUpdate('videomodel', e.target.value as ProviderType)}
                      className="w-full bg-[#0D0F12] text-slate-200 text-xs rounded-md pl-3 pr-8 py-2 border border-white/5 focus:border-[#7B8BFF] outline-none appearance-none font-medium cursor-pointer"
                    >
                      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-[9px] text-slate-500 pointer-events-none" size={14} />
                  </div>
                </div>

              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
};

export default ModelSelector;

