export const PIXEL_DOODLE_COLUMNS = 16
export const PIXEL_DOODLE_ROWS = 10
export const PIXEL_DOODLE_CELL_COUNT = PIXEL_DOODLE_COLUMNS * PIXEL_DOODLE_ROWS

export const PIXEL_DOODLE_COLORS = [
  '#f7b1e6',
  '#7dd3fc',
  '#b7f27d',
  '#b7a0ff',
  '#ffbd79',
  '#ffe45c',
] as const

export const PIXEL_DOODLE_PROMPTS = [
  'rocket ship',
  'pizza slice',
  'house plant',
  'happy cloud',
  'rubber duck',
  'trophy',
  'mystery snack',
  'tiny robot',
  'coffee mug',
  'disco ball',
  'sea creature',
  'favorite animal',
] as const

export type PixelDoodleColor = (typeof PIXEL_DOODLE_COLORS)[number]

export interface PixelDoodle {
  prompt: string
  pixels: Record<string, PixelDoodleColor>
}

export function parsePixelDoodle(value: unknown): PixelDoodle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const prompt = typeof candidate.prompt === 'string' ? candidate.prompt.trim().slice(0, 80) : ''
  const rawPixels = candidate.pixels
  if (!prompt || !rawPixels || typeof rawPixels !== 'object' || Array.isArray(rawPixels)) return null

  const pixels: Record<string, PixelDoodleColor> = {}
  for (const [key, color] of Object.entries(rawPixels)) {
    const index = Number(key)
    const isValidIndex = Number.isInteger(index) && index >= 0 && index < PIXEL_DOODLE_CELL_COUNT
    const isValidColor = PIXEL_DOODLE_COLORS.includes(color as PixelDoodleColor)
    if (isValidIndex && isValidColor) pixels[key] = color as PixelDoodleColor
  }

  return Object.keys(pixels).length ? { prompt, pixels } : null
}
