'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface ImageCropModalProps {
  imageSrc: string;
  aspect?: number;
  circular?: boolean;
  title?: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

export default function ImageCropModal({ imageSrc, aspect, circular = false, title = 'Crop photo', onConfirm, onCancel }: ImageCropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [nat, setNat] = useState({ w: 1, h: 1 });

  // Use refs for box + drag so event listeners always see latest values
  const boxRef = useRef({ x: 0, y: 0, w: 200, h: 200 });
  const [box, setBox] = useState({ x: 0, y: 0, w: 200, h: 200 });
  const containerSize = useRef({ w: 1, h: 1 });
  const drag = useRef<{ type: 'move'|'resize'; handle?: string; startX: number; startY: number; startBox: typeof box } | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const clamp = (b: typeof box) => {
    const { w: cW, h: cH } = containerSize.current;
    const min = 40;
    let { x, y, w, h } = b;
    w = Math.max(min, Math.min(w, cW));
    h = Math.max(min, Math.min(h, cH));
    x = Math.max(0, Math.min(x, cW - w));
    y = Math.max(0, Math.min(y, cH - h));
    return { x, y, w, h };
  };

  const updateBox = (b: typeof box) => {
    const clamped = clamp(b);
    boxRef.current = clamped;
    setBox(clamped);
  };

  const initBox = useCallback((cW: number, cH: number) => {
    const pad = 28;
    let bw = cW - pad * 2;
    let bh = cH - pad * 2;
    if (aspect) { if (bw / bh > aspect) bw = bh * aspect; else bh = bw / aspect; }
    updateBox({ x: (cW - bw) / 2, y: (cH - bh) / 2, w: bw, h: bh });
  }, [aspect]);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNat({ w: img.naturalWidth, h: img.naturalHeight });
    const cont = containerRef.current;
    if (cont) {
      const { width, height } = cont.getBoundingClientRect();
      containerSize.current = { w: width, h: height };
      initBox(width, height);
    }
    setImgLoaded(true);
  };

  const getPos = (e: MouseEvent | TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  };

  useEffect(() => {
    if (!imgLoaded) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!drag.current) return;
      if (e.cancelable) e.preventDefault();
      const pos = getPos(e);
      const dx = pos.x - drag.current.startX;
      const dy = pos.y - drag.current.startY;
      const { startBox, type, handle } = drag.current;

      if (type === 'move') {
        updateBox({ ...startBox, x: startBox.x + dx, y: startBox.y + dy });
      } else if (handle) {
        let { x, y, w, h } = startBox;
        if (handle.includes('e')) w = Math.max(40, startBox.w + dx);
        if (handle.includes('s')) h = Math.max(40, startBox.h + dy);
        if (handle.includes('w')) { x = startBox.x + dx; w = Math.max(40, startBox.w - dx); }
        if (handle.includes('n')) { y = startBox.y + dy; h = Math.max(40, startBox.h - dy); }
        if (aspect) {
          if (handle.includes('e') || handle.includes('w')) h = w / aspect;
          else w = h * aspect;
          if (handle.includes('n')) y = startBox.y + startBox.h - h;
          if (handle.includes('w')) x = startBox.x + startBox.w - w;
        }
        updateBox({ x, y, w, h });
      }
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [imgLoaded, aspect]);

  const startDrag = (e: React.MouseEvent | React.TouchEvent, type: 'move'|'resize', handle?: string) => {
    e.stopPropagation();
    const pos = 'touches' in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
    // Always read from ref so we have latest box
    drag.current = { type, handle, startX: pos.x, startY: pos.y, startBox: { ...boxRef.current } };
  };

  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img || !imgLoaded) return;
    setProcessing(true);
    try {
      const b = boxRef.current;
      const contRect = containerRef.current!.getBoundingClientRect();
      const elemW = contRect.width;
      const elemH = contRect.height;

      // object-contain: calculate actual rendered image rect within the container
      const imageRatio = nat.w / nat.h;
      const elemRatio = elemW / elemH;
      let renderedW: number, renderedH: number, offsetX: number, offsetY: number;
      if (imageRatio > elemRatio) {
        // Letterboxed top/bottom
        renderedW = elemW;
        renderedH = elemW / imageRatio;
        offsetX = 0;
        offsetY = (elemH - renderedH) / 2;
      } else {
        // Letterboxed left/right
        renderedH = elemH;
        renderedW = elemH * imageRatio;
        offsetX = (elemW - renderedW) / 2;
        offsetY = 0;
      }

      const scaleX = nat.w / renderedW;
      const scaleY = nat.h / renderedH;

      const srcX = Math.max(0, (b.x - offsetX) * scaleX);
      const srcY = Math.max(0, (b.y - offsetY) * scaleY);
      const srcW = Math.min(nat.w - srcX, b.w * scaleX);
      const srcH = Math.min(nat.h - srcY, b.h * scaleY);

      const OUTPUT = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = aspect ? Math.round(OUTPUT / aspect) : Math.round(OUTPUT * (srcH / srcW));
      const ctx = canvas.getContext('2d')!;
      if (circular) {
        ctx.beginPath();
        ctx.arc(canvas.width/2, canvas.height/2, Math.min(canvas.width,canvas.height)/2, 0, Math.PI*2);
        ctx.clip();
      }
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => { setProcessing(false); if (blob) onConfirm(blob); }, 'image/jpeg', 0.88);
    } catch { setProcessing(false); }
  };

  // Handle positions relative to the container, offset by box position
  const HANDLE = 11;
  const handles: { id: string; style: React.CSSProperties }[] = [
    { id:'nw', style: { top: box.y - HANDLE, left: box.x - HANDLE, cursor:'nw-resize' } },
    { id:'n',  style: { top: box.y - HANDLE, left: box.x + box.w/2 - HANDLE, cursor:'n-resize' } },
    { id:'ne', style: { top: box.y - HANDLE, left: box.x + box.w - HANDLE, cursor:'ne-resize' } },
    { id:'e',  style: { top: box.y + box.h/2 - HANDLE, left: box.x + box.w - HANDLE, cursor:'e-resize' } },
    { id:'se', style: { top: box.y + box.h - HANDLE, left: box.x + box.w - HANDLE, cursor:'se-resize' } },
    { id:'s',  style: { top: box.y + box.h - HANDLE, left: box.x + box.w/2 - HANDLE, cursor:'s-resize' } },
    { id:'sw', style: { top: box.y + box.h - HANDLE, left: box.x - HANDLE, cursor:'sw-resize' } },
    { id:'w',  style: { top: box.y + box.h/2 - HANDLE, left: box.x - HANDLE, cursor:'w-resize' } },
  ];

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col z-[70]">
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4">
        <button onClick={onCancel} className="text-white/70 hover:text-white text-sm font-medium px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors">Cancel</button>
        <p className="text-white font-semibold text-sm">{title}</p>
        <button onClick={handleConfirm} disabled={!imgLoaded || processing}
          className="bg-emerald-500 text-white text-sm font-semibold px-4 py-1.5 rounded-xl disabled:opacity-40 hover:bg-emerald-400 transition-colors">
          {processing ? 'Saving…' : 'Use photo'}
        </button>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ touchAction:'none', userSelect:'none' }}>
        <img ref={imgRef} src={imageSrc} alt="crop" onLoad={onImageLoad}
          className="absolute inset-0 w-full h-full object-contain" draggable={false} />

        {imgLoaded && (
          <>
            {/* Dark overlay with crop hole */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <defs>
                <mask id="crop-hole">
                  <rect width="100%" height="100%" fill="white" />
                  <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="black"
                    rx={circular ? Math.min(box.w,box.h)/2 : 4} />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#crop-hole)" />
              {/* Crop border */}
              <rect x={box.x} y={box.y} width={box.w} height={box.h}
                fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.85"
                rx={circular ? Math.min(box.w,box.h)/2 : 4} />
              {/* Rule of thirds */}
              {!circular && <>
                <line x1={box.x+box.w/3} y1={box.y} x2={box.x+box.w/3} y2={box.y+box.h} stroke="white" strokeWidth="0.6" strokeOpacity="0.3"/>
                <line x1={box.x+box.w*2/3} y1={box.y} x2={box.x+box.w*2/3} y2={box.y+box.h} stroke="white" strokeWidth="0.6" strokeOpacity="0.3"/>
                <line x1={box.x} y1={box.y+box.h/3} x2={box.x+box.w} y2={box.y+box.h/3} stroke="white" strokeWidth="0.6" strokeOpacity="0.3"/>
                <line x1={box.x} y1={box.y+box.h*2/3} x2={box.x+box.w} y2={box.y+box.h*2/3} stroke="white" strokeWidth="0.6" strokeOpacity="0.3"/>
              </>}
            </svg>

            {/* Invisible move target over crop box */}
            <div style={{ position:'absolute', left:box.x, top:box.y, width:box.w, height:box.h, cursor:'move', touchAction:'none' }}
              onMouseDown={(e) => startDrag(e,'move')}
              onTouchStart={(e) => startDrag(e,'move')} />

            {/* Handles — positioned relative to container using box coords */}
            {!circular && handles.map(({ id, style }) => (
              <div key={id} style={{
                position:'absolute', width:22, height:22,
                background:'white', border:'2px solid #34d399',
                borderRadius:4, boxShadow:'0 1px 6px rgba(0,0,0,0.5)',
                touchAction:'none', zIndex:10, ...style,
              }}
                onMouseDown={(e) => startDrag(e,'resize',id)}
                onTouchStart={(e) => startDrag(e,'resize',id)} />
            ))}
          </>
        )}
      </div>

      <div className="flex-shrink-0 py-3 text-center">
        <p className="text-white/35 text-xs">Drag box to move · Drag handles to resize</p>
      </div>
    </div>
  );
}
