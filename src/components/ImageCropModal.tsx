'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface ImageCropModalProps {
  imageSrc: string;
  aspect?: number;   // 1 = square, 16/9 = wide, etc.
  circular?: boolean;
  title?: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

// The crop box is rendered at this size on screen (px)
const CROP_BOX_W = 300;

export default function ImageCropModal({
  imageSrc,
  aspect = 1,
  circular = false,
  title = 'Crop image',
  onConfirm,
  onCancel,
}: ImageCropModalProps) {
  const cropW = CROP_BOX_W;
  const cropH = Math.round(CROP_BOX_W / aspect);

  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });
  const [loaded, setLoaded] = useState(false);
  const [processing, setProcessing] = useState(false);

  // tx/ty = offset of image center from crop-box center (px, screen coords)
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [scale, setScale] = useState(1);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Minimum scale = image must fill the crop box entirely
  const minScale = useCallback(
    (nw: number, nh: number) => Math.max(cropW / nw, cropH / nh),
    [cropW, cropH]
  );

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: nw, naturalHeight: nh } = e.currentTarget;
    setNaturalSize({ w: nw, h: nh });
    const initScale = Math.max(cropW / nw, cropH / nh);
    setScale(initScale);
    setTx(0);
    setTy(0);
    setLoaded(true);
  };

  // Clamp tx/ty so image always covers the crop box
  const clamp = useCallback(
    (x: number, y: number, s: number, nw: number, nh: number) => {
      const imgW = nw * s;
      const imgH = nh * s;
      // Half of image minus half of crop box = max offset
      const maxX = (imgW - cropW) / 2;
      const maxY = (imgH - cropH) / 2;
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [cropW, cropH]
  );

  // ── Drag (mouse) ──────────────────────────────────────────────
  const drag = useRef<{ sx: number; sy: number; stx: number; sty: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = { sx: e.clientX, sy: e.clientY, stx: tx, sty: ty };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.sx;
      const dy = e.clientY - drag.current.sy;
      const clamped = clamp(drag.current.stx + dx, drag.current.sty + dy, scale, naturalSize.w, naturalSize.h);
      setTx(clamped.x);
      setTy(clamped.y);
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [scale, naturalSize, clamp]);

  // ── Touch (drag + pinch) ──────────────────────────────────────
  // React registers JSX touch handlers as passive, which prevents e.preventDefault()
  // from working (breaking scroll on iOS). We attach non-passive native listeners
  // imperatively via a ref instead.
  const cropBoxRef = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ dist: number; startScale: number; stx: number; sty: number } | null>(null);
  const touchDrag = useRef<{ sx: number; sy: number; stx: number; sty: number } | null>(null);

  // Handler refs hold fresh closures each render; stable wrappers below call through them.
  const touchStartHandlerRef = useRef<(e: TouchEvent) => void>(() => {});
  const touchMoveHandlerRef = useRef<(e: TouchEvent) => void>(() => {});

  // Keep handler refs up to date with latest state values (runs every render)
  useEffect(() => {
    touchStartHandlerRef.current = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        touchDrag.current = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, stx: tx, sty: ty };
        pinch.current = null;
      } else if (e.touches.length === 2) {
        touchDrag.current = null;
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinch.current = { dist, startScale: scale, stx: tx, sty: ty };
      }
    };
    touchMoveHandlerRef.current = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && touchDrag.current) {
        const dx = e.touches[0].clientX - touchDrag.current.sx;
        const dy = e.touches[0].clientY - touchDrag.current.sy;
        const clamped = clamp(touchDrag.current.stx + dx, touchDrag.current.sty + dy, scale, naturalSize.w, naturalSize.h);
        setTx(clamped.x);
        setTy(clamped.y);
      } else if (e.touches.length === 2 && pinch.current) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const ratio = dist / pinch.current.dist;
        const min = minScale(naturalSize.w, naturalSize.h);
        const newScale = Math.min(6, Math.max(min, pinch.current.startScale * ratio));
        const clamped = clamp(pinch.current.stx, pinch.current.sty, newScale, naturalSize.w, naturalSize.h);
        setScale(newScale);
        setTx(clamped.x);
        setTy(clamped.y);
      }
    };
  }); // no deps — runs every render to capture fresh closure

  // Attach once with passive:false so preventDefault() actually works
  useEffect(() => {
    const el = cropBoxRef.current;
    if (!el) return;
    const ts = (e: TouchEvent) => touchStartHandlerRef.current(e);
    const tm = (e: TouchEvent) => touchMoveHandlerRef.current(e);
    const te = () => { touchDrag.current = null; pinch.current = null; };
    el.addEventListener('touchstart', ts, { passive: false });
    el.addEventListener('touchmove',  tm, { passive: false });
    el.addEventListener('touchend',   te);
    return () => {
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove',  tm);
      el.removeEventListener('touchend',   te);
    };
  }, []); // empty — stable wrappers never change

  // ── Scroll to zoom (desktop) ──────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const min = minScale(naturalSize.w, naturalSize.h);
    const newScale = Math.min(6, Math.max(min, scale * (1 - e.deltaY * 0.001)));
    const clamped = clamp(tx, ty, newScale, naturalSize.w, naturalSize.h);
    setScale(newScale);
    setTx(clamped.x);
    setTy(clamped.y);
  };

  // ── Confirm: draw visible area to canvas ─────────────────────
  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img || !loaded) return;
    setProcessing(true);
    try {
      const outputW = circular ? 400 : 1200;
      const outputH = circular ? 400 : Math.round(1200 / aspect);

      const canvas = document.createElement('canvas');
      canvas.width = outputW;
      canvas.height = outputH;
      const ctx = canvas.getContext('2d')!;

      if (circular) {
        ctx.beginPath();
        ctx.arc(outputW / 2, outputH / 2, outputW / 2, 0, Math.PI * 2);
        ctx.clip();
      }

      // Visible region in natural image coordinates:
      // The image center (in screen coords) is at crop-box-center + (tx, ty)
      // i.e., at screen pos (cropW/2 + tx, cropH/2 + ty) relative to crop box top-left
      // The crop box shows [0, cropW] x [0, cropH]
      // Top-left of visible area, in natural image coords:
      const srcX = naturalSize.w / 2 - (cropW / 2 + tx) / scale;
      const srcY = naturalSize.h / 2 - (cropH / 2 + ty) / scale;
      const srcW = cropW / scale;
      const srcH = cropH / scale;

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outputW, outputH);

      canvas.toBlob(
        (blob) => { if (blob) onConfirm(blob); },
        'image/jpeg',
        0.88
      );
    } finally {
      setProcessing(false);
    }
  };

  // Image rendered size on screen
  const imgDisplayW = naturalSize.w * scale;
  const imgDisplayH = naturalSize.h * scale;

  // background-position: where is the top-left of the image relative to the crop box?
  // Image center is at (cropW/2 + tx, cropH/2 + ty)
  const bgLeft = cropW / 2 + tx - imgDisplayW / 2;
  const bgTop  = cropH / 2 + ty - imgDisplayH / 2;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      {/* Hidden img element for canvas source (must be CORS-compatible) */}
      <img ref={imgRef} src={imageSrc} onLoad={onImageLoad} style={{ display: 'none' }} alt="" crossOrigin="anonymous" />

      <div
        style={{
          background: 'white',
          borderRadius: '16px',
          overflow: 'hidden',
          width: '100%',
          maxWidth: '400px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 600, fontSize: '15px', color: '#111827' }}>{title}</span>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#6b7280', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Dark area around the crop box */}
        <div style={{
          background: '#1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}>
          {/* Crop box */}
          <div
            ref={cropBoxRef}
            onMouseDown={onMouseDown}
            onWheel={onWheel}
            style={{
              width: cropW,
              height: cropH,
              position: 'relative',
              overflow: 'hidden',
              cursor: 'grab',
              borderRadius: circular ? '50%' : '8px',
              boxShadow: circular
                ? '0 0 0 3px rgba(255,255,255,0.6), 0 0 0 9999px rgba(0,0,0,0.6)'
                : '0 0 0 3px rgba(255,255,255,0.5), 0 0 0 9999px rgba(0,0,0,0.5)',
              touchAction: 'none',
              userSelect: 'none',
              flexShrink: 0,
            }}
          >
            {loaded ? (
              <img
                src={imageSrc}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: bgLeft,
                  top: bgTop,
                  width: imgDisplayW,
                  height: imgDisplayH,
                  pointerEvents: 'none',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 28, height: 28, border: '2px solid white', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            )}
          </div>
        </div>

        {/* Hint */}
        <div style={{ padding: '8px 16px', fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>
          Drag to reposition{aspect !== 1 ? '' : ''} · Scroll or pinch to zoom
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid #f3f4f6' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 18px', borderRadius: '8px', border: '1px solid #d1d5db',
              background: 'white', color: '#374151', fontWeight: 500, fontSize: '14px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!loaded || processing}
            style={{
              padding: '8px 18px', borderRadius: '8px', border: 'none',
              background: loaded && !processing ? '#111827' : '#9ca3af',
              color: 'white', fontWeight: 500, fontSize: '14px',
              cursor: loaded && !processing ? 'pointer' : 'not-allowed',
            }}
          >
            {processing ? 'Saving...' : 'Use this crop'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
