import { useRef, useState } from 'react';

export function useHover(enterMs = 150, leaveMs = 200) {
  const [hovered, setHovered] = useState(false);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; }
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
  };

  const onPointerEnter = () => {
    clear();
    enterTimer.current = setTimeout(() => setHovered(true), enterMs);
  };
  const onPointerLeave = () => {
    clear();
    leaveTimer.current = setTimeout(() => setHovered(false), leaveMs);
  };

  return { hovered, bind: { onPointerEnter, onPointerLeave } };
}
