import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimecode, formatFileSize, calcAspectRatio } from "@/lib/utils";
import type { VideoMetadata } from "@/lib/types";

interface Props {
  metadata: VideoMetadata;
  fileSize: number;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function VideoMetadataCard({ metadata, fileSize }: Props) {
  const aspectRatio = metadata.width && metadata.height
    ? calcAspectRatio(metadata.width, metadata.height)
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Informazioni video</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {metadata.width && metadata.height && (
          <Row label="Risoluzione" value={`${metadata.width}×${metadata.height}${aspectRatio ? ` (${aspectRatio})` : ""}`} />
        )}
        {metadata.fps && (
          <Row label="Frame rate" value={`${metadata.fps.toFixed(2)} fps`} />
        )}
        {metadata.duration && (
          <Row label="Durata" value={formatTimecode(metadata.duration)} />
        )}
        {metadata.codec && (
          <Row label="Codec" value={metadata.codec} />
        )}
        <Row label="Dimensione" value={formatFileSize(fileSize)} />
      </CardContent>
    </Card>
  );
}
