import React from 'react';
import { Scene, ImageGenStatus, GlobalStyle, Asset } from '@/shared/types';
import { Translation } from '@/services/i18n/translations';
import { LazyMedia } from '@/ui/common/LazyMedia';
import { Image as ImageIcon, Aperture, RefreshCw, Download, Video, Film, Upload } from 'lucide-react';

interface SceneMediaViewerProps {
    scene: Scene;
    labels: Translation;
    onUpdate: (id: string, field: keyof Scene, value: any) => void;
    genStatus: ImageGenStatus;
    videoStatus: ImageGenStatus;
    viewMode: 'image' | 'video';
    setViewMode: (mode: 'image' | 'video') => void;
    hasImage: boolean;
    hasVideo: boolean;
    isGeneratingExternal: boolean;
    areAssetsReady: boolean;
    onGenerateImage: (force?: boolean) => void;
    onGenerateVideo: () => void;
    onUploadClick: () => void;
    onRefresh: () => void;
    onSaveImage: () => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const SceneMediaViewer: React.FC<SceneMediaViewerProps> = ({
    scene,
    labels,
    onUpdate,
    genStatus,
    videoStatus,
    viewMode,
    setViewMode,
    hasImage,
    hasVideo,
    isGeneratingExternal,
    areAssetsReady,
    onGenerateImage,
    onGenerateVideo,
    onUploadClick,
    onRefresh,
    onSaveImage,
    fileInputRef,
    onFileChange,
}) => {
    return (
        <div className="w-full md:w-[320px] bg-black/40 min-h-[250px] relative border-b md:border-b-0 md:border-r border-white/5 flex items-center justify-center group shrink-0">
            <input
                type="file"
                ref={fileInputRef}
                onChange={onFileChange}
                accept="image/*"
                className="hidden"
            />

            {/* Start/End Frame Mode Toggle */}
            {scene.imageUrl && (
                <div className="absolute top-2 left-2 z-10">
                    <button
                        onClick={() => {
                            const newValue = !scene.isStartEndFrameMode;
                            onUpdate(scene.id, 'isStartEndFrameMode', newValue);
                            if (newValue) {
                                const startId = `scene_img_${scene.id}`;
                                if (!scene.startEndAssetIds || scene.startEndAssetIds.length === 0) {
                                    onUpdate(scene.id, 'startEndAssetIds', [startId]);
                                }
                            }
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-sm ${scene.isStartEndFrameMode
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

            {hasImage ? (
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                    {viewMode === 'video' && hasVideo ? (
                        <LazyMedia
                            key={scene.videoUrl || scene.videoAssetId}
                            assetId={scene.videoAssetId}
                            fallbackUrl={scene.videoUrl}
                            type="video"
                            controls
                            className="w-full h-full max-h-[320px]"
                            imgClassName="max-w-full max-h-[320px] object-contain"
                        />
                    ) : (
                        <LazyMedia
                            assetId={scene.imageAssetId}
                            fallbackUrl={scene.imageUrl}
                            type="image"
                            alt={`Scene ${scene.id}`}
                            className="w-full h-full max-h-[320px] cursor-pointer"
                            imgClassName="max-w-full max-h-[320px] w-auto h-auto object-contain"
                            onClick={onSaveImage}
                        />
                    )}

                    {/* View Toggle */}
                    {(hasImage && hasVideo) && (
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
                        <button
                            onClick={onUploadClick}
                            className="p-2 bg-black/60 text-white rounded-full hover:bg-banana-500 hover:text-black transition-colors opacity-0 group-hover:opacity-100"
                            title={labels.uploadImage || "Upload Image"}
                        >
                            <Upload className="w-4 h-4" />
                        </button>

                        <button
                            onClick={onRefresh}
                            className={`p-2 bg-black/60 text-white rounded-full hover:bg-banana-500 hover:text-black transition-colors ${(genStatus === ImageGenStatus.GENERATING || videoStatus === ImageGenStatus.GENERATING) ? 'animate-spin cursor-not-allowed opacity-50' : 'opacity-0 group-hover:opacity-100'}`}
                            title={labels.regenerate}
                            disabled={genStatus === ImageGenStatus.GENERATING || videoStatus === ImageGenStatus.GENERATING || !areAssetsReady}
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>

                        {!scene.videoUrl && (
                            <button
                                onClick={onGenerateVideo}
                                disabled={videoStatus === ImageGenStatus.GENERATING}
                                className={`p-2 bg-blue-600/80 text-white rounded-full hover:bg-blue-500 transition-colors ${videoStatus === ImageGenStatus.GENERATING ? 'cursor-not-allowed' : 'opacity-0 group-hover:opacity-100'}`}
                                title={labels.genVideo}
                            >
                                {videoStatus === ImageGenStatus.GENERATING ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Film className="w-4 h-4" />}
                            </button>
                        )}

                        {scene.imageUrl && (
                            <button
                                onClick={onSaveImage}
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
                                        onClick={() => onGenerateImage(false)}
                                        disabled={!areAssetsReady}
                                        className={`px-4 py-2 rounded-lg border text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 ${areAssetsReady
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
                                    onClick={onUploadClick}
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
    );
};

export default SceneMediaViewer;
