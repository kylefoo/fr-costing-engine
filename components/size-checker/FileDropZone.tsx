'use client';

import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB

export interface FilePayload {
  buffer: ArrayBuffer;
  filename: string;
}

interface Props {
  onFiles: (files: FilePayload[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export function FileDropZone({ onFiles, onError, disabled }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function readFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const valid: File[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!file.name.match(/\.(pdf|ai)$/i)) {
        errors.push(`"${file.name}" is not a supported file type (.pdf or .ai).`);
      } else if (file.size > MAX_FILE_BYTES) {
        errors.push(`"${file.name}" exceeds the 200 MB limit.`);
      } else {
        valid.push(file);
      }
    }

    if (errors.length > 0) onError(errors.join(' '));
    if (valid.length === 0) return;

    let completed = 0;
    const results: FilePayload[] = new Array(valid.length);

    valid.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          results[i] = { buffer: e.target.result, filename: file.name };
        }
        completed++;
        if (completed === valid.length) {
          onFiles(results.filter(Boolean));
        }
      };
      reader.onerror = () => {
        onError(`Could not read "${file.name}". Please try again.`);
        completed++;
        if (completed === valid.length) {
          onFiles(results.filter(Boolean));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) readFiles(e.dataTransfer.files);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload files"
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
        <p className="font-medium text-foreground">Drop your files here</p>
        <p className="text-sm text-muted-foreground mt-1">.pdf or .ai · max 200 MB · multiple files supported</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.ai,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) readFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
