'use client'

import { useState, type KeyboardEvent } from 'react'

export interface DeckPreviewSlide {
  number: number
  title: string
  takeaway: string
  body: string[]
  speakerNotes: string
  visualDirection: string
}

type PreviewVariant = 'cover' | 'details' | 'cards' | 'statement'

function variantFor(index: number): PreviewVariant {
  if (index === 0) return 'cover'
  if (index % 3 === 0) return 'statement'
  if (index % 3 === 2) return 'cards'
  return 'details'
}

export function DeckPreviewer({ title, summary, slides }: { title: string; summary: string; slides: DeckPreviewSlide[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const allSlides: DeckPreviewSlide[] = [
    {
      number: 1,
      title,
      takeaway: summary,
      body: [],
      speakerNotes: '',
      visualDirection: '',
    },
    ...slides,
  ]
  const active = allSlides[activeIndex]
  const variant = variantFor(activeIndex)

  function move(direction: -1 | 1) {
    setActiveIndex((current) => Math.min(allSlides.length - 1, Math.max(0, current + direction)))
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move(-1)
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      move(1)
    }
  }

  return (
    <section className="nb-deck-preview" aria-labelledby="deck-preview-title">
      <div className="nb-deck-preview-header">
        <div>
          <span className="nb-kicker">Visual preview</span>
          <h3 id="deck-preview-title" className="mt-3 text-lg font-black uppercase tracking-[-0.05em]">
            Review the presentation
          </h3>
          <p className="mt-1 text-xs font-semibold text-[#625d53]">
            Uses the same content, layout sequence, colors, and speaker notes as the editable PowerPoint export.
          </p>
        </div>
        <span className="nb-status nb-status-recommended">{activeIndex + 1} / {allSlides.length}</span>
      </div>

      <div
        className="nb-deck-preview-viewport"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={`Deck preview, slide ${activeIndex + 1} of ${allSlides.length}. Use left and right arrow keys to change slides.`}
      >
        <div className={`nb-deck-preview-slide nb-deck-preview-${variant}`}>
          {variant === 'cover' && (
            <>
              <div className="nb-deck-preview-arc" />
              <div className="nb-deck-preview-square" />
              <p className="nb-deck-preview-eyebrow">Enablement Do-er</p>
              <h4>{active.title}</h4>
              <p className="nb-deck-preview-summary">{active.takeaway}</p>
            </>
          )}
          {variant === 'statement' && (
            <>
              <div className="nb-deck-preview-arc" />
              <p className="nb-deck-preview-eyebrow">{active.title}</p>
              <h4>{active.takeaway}</h4>
            </>
          )}
          {variant === 'details' && (
            <>
              <div className="nb-deck-preview-number">{String(activeIndex + 1).padStart(2, '0')}</div>
              <h4>{active.title}</h4>
              <p className="nb-deck-preview-takeaway">{active.takeaway}</p>
              <ul className="nb-deck-preview-list">
                {active.body.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <div className="nb-deck-preview-visual">
                <span>Deck review</span>
                <strong>Visual treatment and facilitator guidance are preserved in this slide&apos;s review notes.</strong>
                <small>Open the notes below to review them.</small>
              </div>
            </>
          )}
          {variant === 'cards' && (
            <>
              <h4>{active.title}</h4>
              <p className="nb-deck-preview-takeaway">{active.takeaway}</p>
              <div className={`nb-deck-preview-cards${active.body.length === 4 ? ' is-four' : ''}`}>
                {active.body.slice(0, 4).map((item, index) => (
                  <article key={item} className={index === 1 ? 'is-accent' : undefined}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{item}</strong>
                  </article>
                ))}
              </div>
            </>
          )}
          <div className="nb-deck-preview-footer">
            <span>ActiveCampaign · Enablement</span>
            <span>{String(activeIndex + 1).padStart(2, '0')}</span>
          </div>
        </div>
      </div>

      <div className="nb-deck-preview-controls">
        <button type="button" className="nb-button nb-button-secondary" onClick={() => move(-1)} disabled={activeIndex === 0}>
          Previous
        </button>
        <div className="nb-deck-preview-dots" aria-label="Choose a slide">
          {allSlides.map((slide, index) => (
            <button
              type="button"
              key={`${slide.number}-${index}`}
              className={index === activeIndex ? 'is-active' : undefined}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show slide ${index + 1}: ${slide.title}`}
              aria-current={index === activeIndex ? 'step' : undefined}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="nb-button nb-button-secondary"
          onClick={() => move(1)}
          disabled={activeIndex === allSlides.length - 1}
        >
          Next
        </button>
      </div>

      {(active.speakerNotes || active.visualDirection) && (
        <details className="nb-deck-preview-notes">
          <summary>Show review notes for this slide</summary>
          <p>{[active.visualDirection && `Visual direction:\n${active.visualDirection}`, active.speakerNotes && `Facilitator notes:\n${active.speakerNotes}`].filter(Boolean).join('\n\n')}</p>
        </details>
      )}
    </section>
  )
}
