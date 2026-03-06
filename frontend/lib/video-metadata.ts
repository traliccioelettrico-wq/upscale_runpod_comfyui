import type { VideoMetadata } from "./types";
import { calcAspectRatio } from "./utils";

/**
 * Extracts video metadata using the native HTMLVideoElement API.
 * Runs entirely in the browser — no WASM dependency required.
 */
export async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);

      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = video.duration;

      if (!width || !height) {
        reject(new Error("Impossibile leggere le dimensioni del video"));
        return;
      }

      let orientation: VideoMetadata["orientation"] = "landscape";
      if (width > height) orientation = "landscape";
      else if (height > width) orientation = "portrait";
      else orientation = "square";

      resolve({
        filename: file.name,
        width,
        height,
        fps: null,          // HTMLVideoElement does not expose FPS
        duration: isFinite(duration) ? duration : null,
        totalFrames: null,
        codec: null,        // HTMLVideoElement does not expose codec info
        orientation,
        aspectRatio: calcAspectRatio(width, height),
        fileSize: file.size,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile leggere i metadati del video"));
    };

    video.src = url;
  });
}
