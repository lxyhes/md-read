export function canScrollFocusedRegion(region: { top: number; bottom: number; height: number }, viewport: { top: number; bottom: number; height: number }, deltaY: number): boolean {
  if (region.height <= viewport.height) return false
  return deltaY > 0 ? region.bottom > viewport.bottom + 1 : deltaY < 0 && region.top < viewport.top - 1
}
