'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

const STORAGE_KEY = 'enablement-doer-pixel-canvas'
const GRID_COLUMNS = 12
const GRID_ROWS = 8
const GRID_CELLS = GRID_COLUMNS * GRID_ROWS

const PIXEL_COLORS = [
  { label: 'Pink', value: '#f7b1e6' },
  { label: 'Blue', value: '#7dd3fc' },
  { label: 'Green', value: '#b7f27d' },
  { label: 'Purple', value: '#b7a0ff' },
  { label: 'Orange', value: '#ffbd79' },
] as const

type PixelColor = (typeof PIXEL_COLORS)[number]['value']
type PixelMap = Record<number, PixelColor>

function parsePixels(value: unknown): PixelMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const pixels: PixelMap = {}
  for (const [key, color] of Object.entries(value)) {
    const index = Number(key)
    const isValidIndex = Number.isInteger(index) && index >= 0 && index < GRID_CELLS
    const isValidColor = PIXEL_COLORS.some((pixelColor) => pixelColor.value === color)
    if (isValidIndex && isValidColor) pixels[index] = color as PixelColor
  }
  return pixels
}

export function PixelStudio() {
  const [isOpen, setIsOpen] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [pixels, setPixels] = useState<PixelMap>({})
  const [selectedColor, setSelectedColor] = useState<PixelColor>(PIXEL_COLORS[0].value)
  const isDrawing = useRef(false)
  const ignoreNextClick = useRef(false)

  useEffect(() => {
    try {
      const savedPixels = window.localStorage.getItem(STORAGE_KEY)
      if (savedPixels) setPixels(parsePixels(JSON.parse(savedPixels)))
    } catch {
      setPixels({})
    } finally {
      setIsReady(true)
    }

    const stopDrawing = () => {
      isDrawing.current = false
      window.setTimeout(() => {
        ignoreNextClick.current = false
      }, 0)
    }
    window.addEventListener('pointerup', stopDrawing)
    window.addEventListener('pointercancel', stopDrawing)
    return () => {
      window.removeEventListener('pointerup', stopDrawing)
      window.removeEventListener('pointercancel', stopDrawing)
    }
  }, [])

  useEffect(() => {
    if (!isReady) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels))
  }, [isReady, pixels])

  function fillPixel(index: number) {
    setPixels((currentPixels) => {
      if (currentPixels[index] === selectedColor) return currentPixels
      return { ...currentPixels, [index]: selectedColor }
    })
  }

  function togglePixel(index: number) {
    setPixels((currentPixels) => {
      const nextPixels = { ...currentPixels }
      if (nextPixels[index] === selectedColor) delete nextPixels[index]
      else nextPixels[index] = selectedColor
      return nextPixels
    })
  }

  const pixelCount = Object.keys(pixels).length

  return (
    <>
      <div className="nb-pixel-motes" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => <span className="nb-pixel-mote" key={index} />)}
      </div>

      <aside className="nb-pixel-studio" aria-label="Pixel canvas">
        <button
          type="button"
          className="nb-pixel-toggle"
          aria-expanded={isOpen}
          aria-controls="pixel-studio-panel"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span aria-hidden="true">▦</span> Pixel pad
        </button>

        {isOpen && (
          <section className="nb-pixel-panel" id="pixel-studio-panel">
            <div className="nb-pixel-panel-heading">
              <div>
                <p className="nb-section-title">Graph-paper doodle</p>
                <p className="text-xs font-semibold">Click or drag to make a tiny design.</p>
              </div>
              <span className="nb-pixel-count">{pixelCount}</span>
            </div>

            <div className="nb-pixel-toolbar" role="toolbar" aria-label="Pixel colors">
              {PIXEL_COLORS.map((color) => (
                <button
                  type="button"
                  key={color.value}
                  className="nb-pixel-color"
                  aria-label={`Use ${color.label.toLowerCase()} pixels`}
                  aria-pressed={selectedColor === color.value}
                  onClick={() => setSelectedColor(color.value)}
                  style={{ '--pixel-color': color.value } as CSSProperties}
                />
              ))}
              <button type="button" className="nb-pixel-clear" onClick={() => setPixels({})}>
                Clear
              </button>
            </div>

            <div className="nb-pixel-grid" role="grid" aria-label="Personal pixel canvas">
              {Array.from({ length: GRID_CELLS }, (_, index) => {
                const pixelColor = pixels[index]
                return (
                  <button
                    type="button"
                    role="gridcell"
                    key={index}
                    className="nb-pixel-cell"
                    aria-label={`Pixel ${index + 1}${pixelColor ? ', filled' : ', empty'}`}
                    aria-pressed={Boolean(pixelColor)}
                    onPointerDown={(event) => {
                      event.preventDefault()
                      isDrawing.current = true
                      ignoreNextClick.current = true
                      fillPixel(index)
                    }}
                    onPointerEnter={() => {
                      if (isDrawing.current) fillPixel(index)
                    }}
                    onClick={() => {
                      if (ignoreNextClick.current) {
                        return
                      }
                      togglePixel(index)
                    }}
                    style={pixelColor ? ({ '--pixel-fill': pixelColor } as CSSProperties) : undefined}
                  />
                )
              })}
            </div>
          </section>
        )}
      </aside>
    </>
  )
}
