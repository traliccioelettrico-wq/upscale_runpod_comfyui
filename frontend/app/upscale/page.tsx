import { UpscaleForm } from "@/components/upscale/UpscaleForm";

export default function UpscalePage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Nuovo upscaling</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Carica un video e configura i parametri di output.
        </p>
      </div>
      <UpscaleForm />
    </div>
  );
}
