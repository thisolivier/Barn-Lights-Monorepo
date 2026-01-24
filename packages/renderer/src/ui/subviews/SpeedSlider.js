import React, { useRef, useCallback } from 'react';

const DEAD_ZONE = 0.05;

export default function SpeedSlider({ value, max, onChange }) {
  const sliderRef = useRef(null);
  const activeRef = useRef(false);

  // Convert value (speed) to position [-1, 1]
  const position = (value || 0) / max;
  // Convert position to left percentage: (n * 0.5 + 0.5) * 100
  const leftPercent = (position * 0.5 + 0.5) * 100;

  const update = useCallback((e) => {
    const el = sliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Map clientX to [-1, 1]
    let n = (e.clientX - rect.left) / rect.width * 2 - 1;
    // Clamp to [-1, 1]
    if (n > 1) n = 1;
    if (n < -1) n = -1;
    // Apply dead zone: if |n| < 0.05, speed = 0, else speed = n * max
    const speed = Math.abs(n) < DEAD_ZONE ? 0 : n * max;
    onChange(speed);
  }, [max, onChange]);

  const handlePointerDown = useCallback((e) => {
    activeRef.current = true;
    sliderRef.current?.setPointerCapture(e.pointerId);
    update(e);
  }, [update]);

  const handlePointerMove = useCallback((e) => {
    if (activeRef.current) {
      update(e);
    }
  }, [update]);

  const handlePointerUp = useCallback((e) => {
    activeRef.current = false;
    sliderRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      className="hslider"
      ref={sliderRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="handle" style={{ left: `${leftPercent}%` }}></div>
    </div>
  );
}
