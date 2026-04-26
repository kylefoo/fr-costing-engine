'use client';

import { useEffect, useRef } from 'react';
import type { AnalysisResult, BoxInfo } from '@/lib/pdfium/types';
import { ptToMm } from '@/lib/pdfium/analyzer';

const BOX_STYLES: Record<string, string> = {
  MediaBox:  'rgba(156, 163, 175, 0.9)',
  CropBox:   'rgba(34, 197, 94, 0.9)',
  BleedBox:  'rgba(239, 68, 68, 0.9)',
  TrimBox:   'rgba(59, 130, 246, 0.9)',
};

interface Props {
  result: AnalysisResult;
}

export function AnalysisCanvas({ result }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { rendered, boxes } = result;
    const { data, width, height, scale } = rendered;

    canvas.width = width;
    canvas.height = height;

    // Convert BGRA → RGBA: pdfium renders BGRA, canvas ImageData requires RGBA.
    // BGRA layout: [B=0, G=1, R=2, A=3] per pixel.
    const rgba = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      rgba[i + 0] = data[i + 2]; // R
      rgba[i + 1] = data[i + 1]; // G
      rgba[i + 2] = data[i + 0]; // B
      rgba[i + 3] = data[i + 3]; // A
    }
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);

    const media = boxes.find((b) => b.name === 'MediaBox') as BoxInfo;
    const labelSize = Math.max(10, Math.round(11 * scale));
    ctx.font = `${labelSize}px ui-monospace, monospace`;
    ctx.lineWidth = Math.max(1, scale);

    for (const box of boxes) {
      if (!box.defined) continue;

      const px = (box.x - media.x) * scale;
      const py = (media.y + media.height - box.y - box.height) * scale;
      const pw = box.width * scale;
      const ph = box.height * scale;

      const color = BOX_STYLES[box.name] ?? 'rgba(200,200,200,0.9)';
      ctx.strokeStyle = color;
      ctx.strokeRect(px, py, pw, ph);

      // Label: "TrimBox 210.00 × 297.00 mm"
      const label = `${box.name}  ${ptToMm(box.width).toFixed(2)} × ${ptToMm(box.height).toFixed(2)} mm`;
      ctx.fillStyle = color;
      ctx.fillText(label, px + 4, py + labelSize + 2);
    }
  }, [result]);

  return (
    <div className="overflow-auto rounded-lg border border-border bg-checkerboard">
      <canvas
        ref={canvasRef}
        className="max-w-full block"
        style={{ imageRendering: 'crisp-edges' }}
      />
    </div>
  );
}
