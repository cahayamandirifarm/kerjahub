// Kompres & resize gambar di browser sebelum diupload, supaya file yang
// tersimpan di Supabase Storage tidak berat (foto HP modern bisa 5-15MB).
// Dipakai di form KYC (selfie & KTP/SIM) dan bisa dipakai ulang di form lain.

type CompressOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeBytes?: number;
  mimeType?: string;
};

export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.75,
    maxSizeBytes = 1024 * 1024, // 1MB
    mimeType = "image/jpeg"
  } = options;

  if (!file.type.startsWith("image/")) return file;

  let source: CanvasImageSource & { width: number; height: number };
  try {
    source = (await createImageBitmap(file)) as unknown as CanvasImageSource & { width: number; height: number };
  } catch {
    source = await loadViaImageElement(file);
  }

  const { width, height } = source;
  let targetWidth = width;
  let targetHeight = height;
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    targetWidth = Math.max(1, Math.round(width * ratio));
    targetHeight = Math.max(1, Math.round(height * ratio));
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

  let q = quality;
  let blob = await canvasToBlob(canvas, mimeType, q);
  // Kalau masih di atas batas, turunkan kualitas bertahap sampai muat.
  while (blob && blob.size > maxSizeBytes && q > 0.35) {
    q -= 0.1;
    blob = await canvasToBlob(canvas, mimeType, q);
  }

  // Kalau tetap tidak muat (foto sangat besar/detail), kecilkan dimensinya juga.
  let shrinkAttempts = 0;
  while (blob && blob.size > maxSizeBytes && shrinkAttempts < 4) {
    canvas.width = Math.round(canvas.width * 0.85);
    canvas.height = Math.round(canvas.height * 0.85);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    blob = await canvasToBlob(canvas, mimeType, Math.max(q, 0.5));
    shrinkAttempts++;
  }

  if (!blob) return file;
  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, { type: mimeType });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function loadViaImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
