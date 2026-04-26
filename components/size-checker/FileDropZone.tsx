'use client';

import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB

interface Props {
  onFile: (buffer: ArrayBuffer, filename: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export function FileDropZone({ onFile, onError, disabled }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    if (!file.name.match(/\.(pdf|ai)$/i)) {
      onError('Only .pdf and .ai files are supported.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      onError('File is too large to analyze in the browser (max 200 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        onFile(e.target.result, file.name);
      }
    };
    reader.onerror = () => {
      onError('Could not read the file. Please try again.');
    };
    reader.readAsArrayBuffer(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload file"
      className={cn(
        'border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-3',
        'cursor-pointer transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/30',
        disabled && 'opacity-50 pointer-events-none',
      )}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => !disabled && e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragging(false);
          }
        }}
      onDrop={onDrop}
    >
      <UploadCloud className="size-10 text-muted-foreground" />
      <div className="text-center">
        <p className="font-medium text-foreground">Drop your file here</p>
        <p className="text-sm text-muted-foreground mt-1">.pdf or .ai · max 200 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.ai,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
