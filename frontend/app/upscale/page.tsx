import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UpscaleForm } from "@/components/upscale/UpscaleForm";
import { ImageUpscaleForm } from "@/components/upscale/ImageUpscaleForm";
import { Film, ImageIcon } from "lucide-react";

export default function UpscalePage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Nuovo upscaling</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Carica un video o un'immagine e configura i parametri di output.
        </p>
      </div>

      <Tabs defaultValue="video">
        <TabsList className="w-full">
          <TabsTrigger value="video" className="flex-1 gap-2">
            <Film className="w-3.5 h-3.5" /> Video
          </TabsTrigger>
          <TabsTrigger value="image" className="flex-1 gap-2">
            <ImageIcon className="w-3.5 h-3.5" /> Immagine
          </TabsTrigger>
        </TabsList>

        <TabsContent value="video" className="mt-5">
          <UpscaleForm />
        </TabsContent>

        <TabsContent value="image" className="mt-5">
          <ImageUpscaleForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
