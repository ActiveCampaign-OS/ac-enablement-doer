'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  PIXEL_DOODLE_CELL_COUNT,
  PIXEL_DOODLE_COLORS,
  PIXEL_DOODLE_COLUMNS,
  PIXEL_DOODLE_PROMPTS,
  type PixelDoodle,
  type PixelDoodleColor,
} from '@/lib/pixel-doodle'

function choosePrompt(previousPrompt: string): string {
  const options = PIXEL_DOODLE_PROMPTS.filter((prompt) => prompt !== previousPrompt)
  return options[Math.floor(Math.random() * options.length)]
}

export function PixelDoodlePad({ onChange }: { onChange: (doodle: PixelDoodle | null) => void }) {
  const [prompt, setPrompt] = useState('')
  const [pixels, setPixels] = useState<Record<string, PixelDoodleColor>>({})
  const [selectedColor, setSelectedColor] = useState<PixelDoodleColor>(PIXEL_DOODLE_COLORS[0])
  const isDrawing = useRef(false)
  const ignoreNextClick = useRef(false)

  useEffect(() => {
    setPrompt(choosePrompt(''))

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
    onChange(prompt && Object.keys(pixels).length ? { prompt, pixels } : null)
  }, [onChange, pixels, prompt])

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

  function chooseNewPrompt() {
    setPrompt((currentPrompt) => choosePrompt(currentPrompt))
    setPixels({})
  }

  return (
    <section className="nb-doodle-pad" aria-labelledby="doodle-title">
      <div className="nb-doodle-heading">
        <div>
          <span className="nb-kicker">Optional side quest</span>
          <h2 id="doodle-title" className="mt-3 text-xl font-black uppercase tracking-[-0.06em]">
            Draw a {prompt || 'tiny surprise'}
          </h2>
          <p className="mt-1 text-xs font-semibold text-[#625d53]">
            Click or drag to paint. We&apos;ll keep your masterpiece on this request.
          </p>
        </div>
        <button type="button" className="nb-doodle-prompt" onClick={chooseNewPrompt}>
          New prompt
        </button>
      </div>

      <div className="nb-doodle-toolbar" role="toolbar" aria-label="Doodle colors">
        {PIXEL_DOODLE_COLORS.map((color) => (
          <button
            type="button"
            key={color}
            className="nb-doodle-color"
            aria-label={`Use ${color} pixels`}
            aria-pressed={selectedColor === color}
            onClick={() => setSelectedColor(color)}
            style={{ '--doodle-color': color } as CSSProperties}
          />
        ))}
        <button type="button" className="nb-doodle-clear" onClick={() => setPixels({})}>
          Clear
        </button>
      </div>

      <div
        className="nb-doodle-grid"
        role="grid"
        aria-label={prompt ? `Pixel canvas: draw a ${prompt}` : 'Pixel canvas'}
        style={{ '--doodle-columns': PIXEL_DOODLE_COLUMNS } as CSSProperties}
      >
        {Array.from({ length: PIXEL_DOODLE_CELL_COUNT }, (_, index) => {
          const color = pixels[index]
          return (
            <button
              type="button"
              role="gridcell"
              key={index}
              className="nb-doodle-cell"
              aria-label={`Pixel ${index + 1}${color ? ', filled' : ', empty'}`}
              aria-pressed={Boolean(color)}
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
                if (!ignoreNextClick.current) togglePixel(index)
              }}
              style={color ? ({ '--doodle-fill': color } as CSSProperties) : undefined}
            />
          )
        })}
      </div>
    </section>
  )
}
