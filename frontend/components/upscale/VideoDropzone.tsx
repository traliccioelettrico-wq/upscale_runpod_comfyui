"use client";
import { useCallback, useState } from "react";
import { Upload, Film, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractVideoMetadata } from "@/lib/video-metadata";
import type { VideoMetadata } from "@/lib/types";

interface Props {
  onFileSelected: (file: File, metadata: VideoMetadata) => void;
  onFileCleared: () => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export function VideoDropzone({ onFileSelected, onFileCleared, selectedFile, disabled }: Props) {
  const [dragging, setDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("video/")) {
      setError("Il file selezionato non è un video.");
      return;
    }
    setError(null);
    setExtracting(true);
    try {
      const metadata = await extractVideoMetadata(file);
      onFileSelected(file, metadata);
    } catch {
      setError("Impossibile leggere i metadati del video.");
    } finally {
      setExtracting(false);
    }
  }, [onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [disabled, processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }, [processFile]);

  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
        <Film className="w-8 h-8 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{selectedFile.name}</p>
          <p className="text-xs text-muted-foreground">
            {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
          </p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={onFileCleared}
            className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <label
        className={cn(
          "flex flex-col items-center justify-center gap-3 p-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <Upload className={cn("w-8 h-8", dragging ? "text-primary" : "text-muted-foreground")} />
        <div className="text-center">
          <p className="text-sm font-medium">
            {extracting ? "Analisi video in corso..." : "Trascina un video o clicca per selezionare"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">MP4, MKV, MOV, AVI, ecc.</p>
        </div>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleChange}
          disabled={disabled || extracting}
        />
      </label>
      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
