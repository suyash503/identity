export interface ProcessedPhoto {
  blob: Blob
  thumb: Blob
  w: number
  h: number
}

async function render(bmp: ImageBitmap, maxSide: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode photo'))), 'image/jpeg', quality),
  )
  return { blob, w, h }
}

/** Phone photos are 3–8 MB; store a ~300 KB version plus a small thumbnail. */
export async function processPhoto(file: Blob): Promise<ProcessedPhoto> {
  const bmp = await createImageBitmap(file)
  try {
    const full = await render(bmp, 1600, 0.82)
    const thumb = await render(bmp, 480, 0.75)
    return { blob: full.blob, thumb: thumb.blob, w: full.w, h: full.h }
  } finally {
    bmp.close()
  }
}
