"use client";
import { useCallback, useState } from "react";
import { Upload, Film, X, AlertCircle } from "lucide-react";
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

  /* ── File selected state ── */
  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-muted/20">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 flex-shrink-0">
          <Film className="w-5 h-5 text-primary" />
        </div>
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
            className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Rimuovi file"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  /* ── Dropzone ── */
  return (
    <div>
      <label
        className={cn(
          "group flex flex-col items-center justify-center gap-4 p-10 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200",
          dragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50 hover:bg-muted/20",
          disabled && "opacity-50 cursor-not-allowed pointer-events-none"
        )}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {/* Icon */}
        <div className={cn(
          "flex items-center justify-center w-14 h-14 rounded-2xl transition-all duration-200",
          dragging ? "bg-primary/15 scale-110" : "bg-muted/60 group-hover:bg-primary/10"
        )}>
          <Upload className={cn(
            "w-6 h-6 transition-colors duration-200",
            dragging ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"
          )} />
        </div>

        {/* Text */}
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">
            {extracting
              ? "Analisi video in corso..."
              : dragging
              ? "Rilascia il video qui"
              : "Trascina un video o clicca per selezionare"}
          </p>
          <p className="text-xs text-muted-foreground">MP4, MKV, MOV, AVI — max dimensione consigliata 4 GB</p>
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
        <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
