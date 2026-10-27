import { describe, expect, it } from 'vitest'
import { canScrollFocusedRegion } from './focusWheel'

describe('focus wheel scrolling', () => {
  const viewport = { top: 0, bottom: 600, height: 600 }
  it('scrolls through an oversized region in either direction until its edge', () => {
    expect(canScrollFocusedRegion({ top: -200, bottom: 800, height: 1000 }, viewport, 1)).toBe(true)
    expect(canScrollFocusedRegion({ top: -200, bottom: 800, height: 1000 }, viewport, -1)).toBe(true)
    expect(canScrollFocusedRegion({ top: -400, bottom: 600, height: 1000 }, viewport, 1)).toBe(false)
    expect(canScrollFocusedRegion({ top: 0, bottom: 1000, height: 1000 }, viewport, -1)).toBe(false)
  })
  it('switches regions directly when the current region fits', () => {
    expect(canScrollFocusedRegion({ top: 100, bottom: 400, height: 300 }, viewport, 1)).toBe(false)
  })
})
