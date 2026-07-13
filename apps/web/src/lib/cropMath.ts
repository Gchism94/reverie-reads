// Pure math for the 2:3 cover crop — pan/zoom state → the source rect drawn into the output.
// Kept free of DOM so the clamping (image must always COVER the frame) is unit-tested.

export interface CropState {
  /** zoom ≥ 1, multiplied on top of the base cover-fit scale */
  zoom: number
  /** frame-space offset of the image centre from the frame centre, in frame px */
  tx: number
  ty: number
}

export const COVER_ASPECT = 2 / 3 // width / height
export const CROP_MAX_ZOOM = 4
/** Output long edge — matches the ingest pipeline's cap so the edge function rarely re-resizes. */
export const CROP_OUT_HEIGHT = 1200
export const CROP_OUT_WIDTH = 800

/** The scale that makes the image exactly COVER the frame (CSS object-fit: cover). */
export function coverScale(imgW: number, imgH: number, frameW: number, frameH: number): number {
  return Math.max(frameW / imgW, frameH / imgH)
}

/** Clamp a pan offset so the scaled image still covers the whole frame (no blank margins). */
export function clampOffset(state: CropState, imgW: number, imgH: number, frameW: number, frameH: number): CropState {
  const zoom = Math.min(CROP_MAX_ZOOM, Math.max(1, state.zoom))
  const s = coverScale(imgW, imgH, frameW, frameH) * zoom
  const maxTx = Math.max(0, (imgW * s - frameW) / 2)
  const maxTy = Math.max(0, (imgH * s - frameH) / 2)
  return {
    zoom,
    tx: Math.min(maxTx, Math.max(-maxTx, state.tx)),
    ty: Math.min(maxTy, Math.max(-maxTy, state.ty)),
  }
}

export interface SourceRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/** The image-space rect that the frame currently shows — what drawImage copies to the output. */
export function sourceRect(state: CropState, imgW: number, imgH: number, frameW: number, frameH: number): SourceRect {
  const c = clampOffset(state, imgW, imgH, frameW, frameH)
  const s = coverScale(imgW, imgH, frameW, frameH) * c.zoom
  const sw = frameW / s
  const sh = frameH / s
  // frame centre in image space: image centre shifted by -offset/scale
  const cx = imgW / 2 - c.tx / s
  const cy = imgH / 2 - c.ty / s
  const sx = Math.min(imgW - sw, Math.max(0, cx - sw / 2))
  const sy = Math.min(imgH - sh, Math.max(0, cy - sh / 2))
  return { sx, sy, sw, sh }
}
