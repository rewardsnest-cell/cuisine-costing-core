/**
 * Resize an image Blob/File so its longest edge is at most `maxEdge` px,
 * then re-encode as JPEG at the given quality. PNGs with transparency
 * lose transparency (acceptable for sale-flyer scans).
 *
 * Returns the original blob unchanged when:
 *  - The browser can't decode the image (returns as-is, upload still works)
 *  - The output would be larger than the original (keeps the smaller one)
 */
export async function compressImageBlob(
  input: Blob,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<{ blob: Blob; ext: string }> {
  const maxEdge = opts.maxEdge ?? 2000;
  const quality = opts.quality ?? 0.8;

  // Skip non-images (shouldn't happen, but guard anyway)
  if (!input.type.startsWith("image/")) {
    return { blob: input, ext: extFromType(input.type) };
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(input);
  } catch {
    return { blob: input, ext: extFromType(input.type) };
  }

  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(targetW, targetH);
  } else {
    canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = (canvas as HTMLCanvasElement).getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) {
    bitmap.close?.();
    return { blob: input, ext: extFromType(input.type) };
  }

  // Fill white so JPEG transparency becomes white instead of black
  (ctx as CanvasRenderingContext2D).fillStyle = "#ffffff";
  (ctx as CanvasRenderingContext2D).fillRect(0, 0, targetW, targetH);
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  let out: Blob;
  if ("convertToBlob" in canvas) {
    out = await (canvas as OffscreenCanvas).convertToBlob({
      type: "image/jpeg",
      quality,
    });
  } else {
    out = await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        quality,
      );
    });
  }

  // If compression made the file larger (rare for already-tiny images), keep original
  if (out.size >= input.size) {
    return { blob: input, ext: extFromType(input.type) };
  }
  return { blob: out, ext: "jpg" };
}

function extFromType(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic" || type === "image/heif") return "heic";
  return "jpg";
}
