import { useEffect, useRef } from 'react';
import { createPixelGas, type PixelGasHandle, type PixelGasOptions } from '@/lib/pixelGas';
import { cn } from '@/lib/utils';

export interface PixelGasBackgroundProps extends PixelGasOptions {
  /** Extra classes for the fixed wrapper — handy for setting the page colour underneath. */
  className?: string;
}

/**
 * Full-viewport dithered gas cloud, pinned behind the page content.
 *
 * Decorative only: it is aria-hidden, ignores pointer events, and falls back to
 * drawing nothing at all when WebGL is unavailable, so whatever colour the
 * wrapper (or the body) carries is what shows.
 */
export function PixelGasBackground({
  className,
  baseColor,
  coreColor,
  pixelSize,
  cycleSeconds,
  opacity,
}: PixelGasBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<PixelGasHandle | null>(null);

  // Build the GL context once; option changes are pushed through setOptions
  // below rather than by tearing the context down and back up.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handle = createPixelGas(canvas, {
      baseColor,
      coreColor,
      pixelSize,
      cycleSeconds,
      opacity,
    });
    handleRef.current = handle;

    return () => {
      handle.destroy();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.setOptions({ baseColor, coreColor, pixelSize, cycleSeconds, opacity });
  }, [baseColor, coreColor, pixelSize, cycleSeconds, opacity]);

  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none fixed inset-0 -z-10 overflow-hidden', className)}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}

export default PixelGasBackground;
