import { useState } from 'react';
import html2canvas from 'html2canvas';
import { trackError, trackEvent } from '../lib/telemetry';
import { getShareMessage, type ShareCardKind } from '../lib/shareMessages';

interface SharePreviewState {
  open: boolean;
  title: string;
  text: string;
  imageUrl: string | null;
  file: File | null;
}

export interface ShareCardShareOptions {
  kind: ShareCardKind;
  payload?: Record<string, any>;
  userId?: string;
  filename?: string;
  title?: string;
  brand?: string;
}

export function useShareCard() {
  const [isSharing, setIsSharing] = useState(false);
  const [sharePreview, setSharePreview] = useState<SharePreviewState>({
    open: false,
    title: 'Share',
    text: '',
    imageUrl: null,
    file: null,
  });

  const closeSharePreview = () => {
    if (sharePreview.imageUrl) {
      URL.revokeObjectURL(sharePreview.imageUrl);
    }
    setSharePreview({ open: false, title: 'Share', text: '', imageUrl: null, file: null });
  };

  const downloadSharePreview = () => {
    if (!sharePreview.imageUrl) return;
    const a = document.createElement('a');
    a.href = sharePreview.imageUrl;
    a.download = sharePreview.file?.name || 'examsetu-share.png';
    a.click();
  };

  const sharePreviewNative = async () => {
    if (!sharePreview.file) {
      if (sharePreview.text) {
        await navigator.clipboard.writeText(sharePreview.text);
        alert('Share text copied');
      }
      return;
    }

    if (navigator.share && navigator.canShare?.({ files: [sharePreview.file] })) {
      await navigator.share({
        title: sharePreview.title,
        text: sharePreview.text,
        files: [sharePreview.file],
      });
      return;
    }

    await navigator.clipboard.writeText(sharePreview.text);
    alert('Image downloaded and text copied');
    downloadSharePreview();
  };

  const shareElement = async (element: HTMLElement | null, options: ShareCardShareOptions) => {
    if (!element) return;
    setIsSharing(true);
    let sandbox: HTMLDivElement | null = null;
    try {
      const target = element;

      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready;
      }

      sandbox = document.createElement('div');
      sandbox.style.position = 'fixed';
      sandbox.style.left = '-20000px';
      sandbox.style.top = '0';
      sandbox.style.pointerEvents = 'none';
      sandbox.style.opacity = '0';
      sandbox.style.zIndex = '-1';
      sandbox.style.padding = '0';
      sandbox.style.margin = '0';

      const clone = target.cloneNode(true) as HTMLElement;
      clone.style.margin = '0';
      clone.style.transform = 'none';

      sandbox.appendChild(clone);
      document.body.appendChild(sandbox);

      const renderWidth = Math.max(clone.scrollWidth, clone.offsetWidth, target.scrollWidth, target.offsetWidth);
      const renderHeight = Math.max(clone.scrollHeight, clone.offsetHeight, target.scrollHeight, target.offsetHeight);

      const canvas = await html2canvas(clone, {
        scale: Math.min(window.devicePixelRatio || 2, 2),
        backgroundColor: null,
        useCORS: true,
        width: renderWidth,
        height: renderHeight,
        windowWidth: renderWidth,
        windowHeight: renderHeight,
      });

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Unable to generate share image');

      const file = new File([blob], options.filename || 'examsetu-share.png', { type: 'image/png' });
      const message = getShareMessage({ kind: options.kind, brand: options.brand, ...(options.payload || {}) });

      void trackEvent(`share_${options.kind}_card`, {
        kind: options.kind,
        filename: file.name,
        ...options.payload,
      }, options.userId);
      const url = URL.createObjectURL(blob);
      setSharePreview({
        open: true,
        title: options.title || message.title,
        text: message.text,
        imageUrl: url,
        file,
      });
    } catch (error) {
      void trackError(error, { stage: 'share_card', kind: options.kind }, options.userId);
      throw error;
    } finally {
      if (sandbox && sandbox.parentNode) {
        sandbox.parentNode.removeChild(sandbox);
      }
      setIsSharing(false);
    }
  };

  return {
    isSharing,
    shareElement,
    sharePreview,
    closeSharePreview,
    downloadSharePreview,
    sharePreviewNative,
  };
}
