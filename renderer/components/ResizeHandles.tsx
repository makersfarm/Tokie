import { useRef, useCallback } from 'react';

type Edge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

const EDGES: Edge[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

const MIN = 60, MAX = 600;

interface ResizeStart {
  cursorX: number;
  cursorY: number;
  bounds: { x: number; y: number; w: number; h: number };
}

function clamp(v: number) { return Math.max(MIN, Math.min(MAX, v)); }

function calcBounds(edge: Edge, start: ResizeStart, cx: number, cy: number) {
  const dx = cx - start.cursorX;
  const dy = cy - start.cursorY;
  let { x, y, w, h } = start.bounds;

  const left   = edge === 'w' || edge === 'nw' || edge === 'sw';
  const right  = edge === 'e' || edge === 'ne' || edge === 'se';
  const top    = edge === 'n' || edge === 'nw' || edge === 'ne';
  const bottom = edge === 's' || edge === 'sw' || edge === 'se';

  if (right)  { w = clamp(w + dx); }
  if (bottom) { h = clamp(h + dy); }
  if (left)   { const nw = clamp(w - dx); x = x + w - nw; w = nw; }
  if (top)    { const nh = clamp(h - dy); y = y + h - nh; h = nh; }

  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

export function ResizeHandles() {
  const startRef = useRef<{ edge: Edge; start: ResizeStart } | null>(null);

  const onPointerDown = useCallback((edge: Edge) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    startRef.current = {
      edge,
      start: {
        cursorX: e.screenX,
        cursorY: e.screenY,
        bounds: { x: window.screenX, y: window.screenY, w: window.innerWidth, h: window.innerHeight },
      },
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startRef.current) return;
    const { edge, start } = startRef.current;
    const b = calcBounds(edge, start, e.screenX, e.screenY);
    window.pet.setBounds(b);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    startRef.current = null;
  }, []);

  return (
    <>
      {EDGES.map(edge => (
        <div
          key={edge}
          className={`resize-handle resize-${edge}`}
          onPointerDown={onPointerDown(edge)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      ))}
    </>
  );
}
