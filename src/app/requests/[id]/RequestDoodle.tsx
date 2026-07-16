import type { CSSProperties } from 'react'
import {
  parsePixelDoodle,
  PIXEL_DOODLE_CELL_COUNT,
  PIXEL_DOODLE_COLUMNS,
} from '@/lib/pixel-doodle'

export function RequestDoodle({ value }: { value: unknown }) {
  const doodle = parsePixelDoodle(value)
  if (!doodle) return null

  return (
    <section className="nb-panel p-5 sm:p-6 space-y-4">
      <div>
        <span className="nb-kicker">Intake side quest</span>
        <h2 className="mt-3 text-xl font-black uppercase tracking-[-0.06em]">
          They drew a {doodle.prompt}
        </h2>
      </div>
      <div
        className="nb-doodle-grid nb-doodle-grid-record"
        role="img"
        aria-label={`Pixel drawing of a ${doodle.prompt}`}
        style={{ '--doodle-columns': PIXEL_DOODLE_COLUMNS } as CSSProperties}
      >
        {Array.from({ length: PIXEL_DOODLE_CELL_COUNT }, (_, index) => {
          const color = doodle.pixels[index]
          return (
            <span
              key={index}
              className="nb-doodle-cell"
              data-filled={Boolean(color)}
              style={color ? ({ '--doodle-fill': color } as CSSProperties) : undefined}
            />
          )
        })}
      </div>
    </section>
  )
}
