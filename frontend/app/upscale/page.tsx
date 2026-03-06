import { UpscaleForm } from "@/components/upscale/UpscaleForm";

export default function UpscalePage() {
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Nuovo upscaling</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Carica un video e configura i parametri per avviare l&apos;upscaling.
        </p>
      </div>
      <UpscaleForm />
    </div>
  );
}
