"use client";
import { useCallback, useState, useRef } from "react";
import { ImageIcon, LinkIcon, X, AlertCircle, SwitchCamera } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ImageInput {
  mode: "file" | "url";
  file?: File;
  url?: string;
  previewUrl: string;        // object URL (file) o URL diretto
  width: number;
  height: number;
  fileSize?: number;
}

interface Props {
  value: ImageInput | null;
  onSelected: (input: ImageInput) => void;
  onCleared: () => void;
  disabled?: boolean;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"];

function loadImageDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src     = src;
  });
}

export function ImageDropzone({ value, onSelected, onCleared, disabled }: Props) {
  const [dragging,  setDragging]  = useState(false);
  const [inputMode, setInputMode] = useState<"file" | "url">("file");
  const [urlValue,  setUrlValue]  = useState("");
  const [error,     setError]     = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      setError("Formato non supportato. Usa PNG, JPG, WEBP o AVIF.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const previewUrl = URL.createObjectURL(file);
      const { w, h }   = await loadImageDimensions(previewUrl);
      onSelected({ mode: "file", file, previewUrl, width: w, height: h, fileSize: file.size });
    } catch {
      setError("Impossibile leggere l'immagine.");
    } finally {
      setLoading(false);
    }
  }, [onSelected]);

  const processUrl = useCallback(async () => {
    const url = urlValue.trim();
    if (!url) return;
    setError(null);
    setLoading(true);
    try {
      const { w, h } = await loadImageDimensions(url);
      onSelected({ mode: "url", url, previewUrl: url, width: w, height: h });
    } catch {
      setError("URL non raggiungibile o non è un'immagine valida.");
    } finally {
      setLoading(false);
    }
  }, [urlValue, onSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [disabled, processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }, [processFile]);

  /* ── Immagine selezionata ── */
  if (value) {
    return (
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Preview */}
        <div className="relative bg-muted/30 flex items-center justify-center min-h-40 max-h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.previewUrl}
            alt="Anteprima immagine"
            className="max-h-64 max-w-full object-contain"
          />
          {!disabled && (
            <button
              type="button"
              onClick={onCleared}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Rimuovi immagine"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* Meta */}
        <div className="px-4 py-2.5 border-t border-border flex items-center gap-3">
          <ImageIcon className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">
              {value.mode === "file" ? value.file!.name : value.url}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {value.width} × {value.height} px
              {value.fileSize ? ` · ${(value.fileSize / 1024 / 1024).toFixed(1)} MB` : ""}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Dropzone ── */
  return (
    <div className="space-y-3">
      {/* Tabs input mode */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/40 w-fit">
        <button
          type="button"
          onClick={() => { setInputMode("file"); setError(null); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            inputMode === "file"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ImageIcon className="w-3.5 h-3.5" /> File
        </button>
        <button
          type="button"
          onClick={() => { setInputMode("url"); setError(null); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            inputMode === "url"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LinkIcon className="w-3.5 h-3.5" /> URL
        </button>
      </div>

      {inputMode === "file" ? (
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
          <div className={cn(
            "flex items-center justify-center w-14 h-14 rounded-2xl transition-all duration-200",
            dragging ? "bg-primary/15 scale-110" : "bg-muted/60 group-hover:bg-primary/10"
          )}>
            <ImageIcon className={cn(
              "w-6 h-6 transition-colors",
              dragging ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"
            )} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">
              {loading ? "Analisi immagine..." : dragging ? "Rilascia l'immagine" : "Trascina un'immagine o clicca"}
            </p>
            <p className="text-xs text-muted-foreground">PNG, JPG, WEBP, AVIF</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled || loading}
          />
        </label>
      ) : (
        <div className="flex gap-2">
          <Input
            type="url"
            placeholder="https://esempio.com/immagine.png"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && processUrl()}
            disabled={disabled || loading}
            className="flex-1 text-sm font-mono"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={processUrl}
            disabled={!urlValue.trim() || disabled || loading}
          >
            {loading ? "..." : "Carica"}
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
