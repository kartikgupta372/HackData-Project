import React, { useRef, useEffect } from 'react';

interface NoiseProps {
  patternSize?: number;
  patternScaleX?: number;
  patternScaleY?: number;
  patternRefreshInterval?: number;
  patternAlpha?: number;
  className?: string;
}

const Noise: React.FC<NoiseProps> = ({
  patternRefreshInterval = 4, // Slightly slowed down for better performance
  patternAlpha = 15,
  className
}) => {
  const grainRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = grainRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const canvasSize = 512; // Reduced internal resolution for performance, still looks good due to blur/grain nature
    const frames: ImageData[] = [];
    const numFrames = 5; // Pre-generate 5 noise patterns

    for (let f = 0; f < numFrames; f++) {
      const imageData = ctx.createImageData(canvasSize, canvasSize);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = Math.random() * 255;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = patternAlpha;
      }
      frames.push(imageData);
    }

    let frameCount = 0;
    let currentFrameIndex = 0;
    let animationId: number;

    canvas.width = canvasSize;
    canvas.height = canvasSize;

    const loop = () => {
      if (frameCount % patternRefreshInterval === 0) {
        ctx.putImageData(frames[currentFrameIndex], 0, 0);
        currentFrameIndex = (currentFrameIndex + 1) % numFrames;
      }
      frameCount++;
      animationId = window.requestAnimationFrame(loop);
    };

    loop();

    return () => {
      window.cancelAnimationFrame(animationId);
    };
  }, [patternAlpha, patternRefreshInterval]);

  return (
    <canvas
      className={`pointer-events-none absolute inset-0 w-full h-full ${className}`}
      ref={grainRef}
      style={{
        imageRendering: 'pixelated'
      }}
    />
  );
};

export default Noise;
