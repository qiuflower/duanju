import { useState, useEffect } from 'react';
import { loadAssetUrl } from '../services/storage';

export const useAssetUrl = (assetId?: string, fallbackUrl?: string) => {
  const [url, setUrl] = useState<string | null>(fallbackUrl || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If we have a fallback URL (e.g. newly generated base64), use it directly
    if (fallbackUrl) {
      setUrl(fallbackUrl);
      return;
    }

    if (!assetId) {
      setUrl(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      try {
        const blobUrl = await loadAssetUrl(assetId);
        if (active && blobUrl) {
            objectUrl = blobUrl;
            setUrl(blobUrl);
        }
      } catch (e) {
        console.error(`Failed to load asset ${assetId}`, e);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [assetId, fallbackUrl]);

  return { url, loading };
};
