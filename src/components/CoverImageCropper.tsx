import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  imageSrc: string | null;
  /** Aspect ratio width/height. Default 16/6 (banner/capa). */
  aspect?: number;
  onCancel: () => void;
  onConfirm: (croppedBlob: Blob, previewUrl: string) => void;
};

async function getCroppedBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = area.width;
  canvas.height = area.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao cortar imagem"))), "image/jpeg", 0.92);
  });
}

export function CoverImageCropper({ open, imageSrc, aspect = 16 / 6, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setAreaPx(pixels);
  }, []);

  const confirm = async () => {
    if (!imageSrc || !areaPx) return;
    setBusy(true);
    try {
      const blob = await getCroppedBlob(imageSrc, areaPx);
      const url = URL.createObjectURL(blob);
      onConfirm(blob, url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajustar foto de capa</DialogTitle>
        </DialogHeader>
        <div className="relative w-full h-[360px] bg-muted rounded-md overflow-hidden">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              showGrid
              objectFit="contain"
            />
          )}
        </div>
        <div className="space-y-2 px-1">
          <Label className="text-xs">Zoom</Label>
          <Slider value={[zoom]} min={1} max={4} step={0.05} onValueChange={(v) => setZoom(v[0])} />
          <p className="text-xs text-muted-foreground">Arraste a imagem para reposicionar e use o controle acima para ajustar o zoom.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="button" onClick={confirm} disabled={busy || !areaPx}>{busy ? "Processando..." : "Aplicar corte"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
