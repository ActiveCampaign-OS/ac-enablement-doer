import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import PptxGenJS from 'pptxgenjs'
import type { AssetArtifactKind, DeliverableType } from '@prisma/client'
import { assetArtifactFileName } from './asset-builds'

export interface AssetDraftContent {
  title: string
  summary: string
  markdown: string
  slides: unknown[]
}

export interface DraftArtifactPayload {
  kind: AssetArtifactKind
  fileName: string
  content: string | Uint8Array
  contentType: string
}

interface DeckSlide {
  number: number
  title: string
  takeaway: string
  body: string[]
  speakerNotes: string
  visualDirection: string
}

const DECK_COLORS = {
  midnight: '00002D',
  dusk: '003343',
  acBlue: '0022D2',
  lightBlue: 'F3FAFF',
  cream: 'FBF9F3',
  white: 'FFFFFF',
  mist: 'D8F3FF',
} as const

const DECK_HEADLINE_FONT = 'Arimo'
const DECK_BODY_FONT = 'IBM Plex Sans'

function clip(value: string, maxLength: number): string {
  const normalized = plainText(value).replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function normalizeDeckSlides(slides: unknown[]): DeckSlide[] {
  return slides
    .map((slide, index) => {
      if (!slide || typeof slide !== 'object') return null
      const candidate = slide as Record<string, unknown>
      const title = typeof candidate.title === 'string' ? clip(candidate.title, 100) : ''
      const takeaway = typeof candidate.takeaway === 'string' ? clip(candidate.takeaway, 230) : ''
      const body = Array.isArray(candidate.body)
        ? candidate.body
            .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
            .slice(0, 5)
            .map((item) => clip(item, 185))
        : []
      const speakerNotes = typeof candidate.speakerNotes === 'string' ? clip(candidate.speakerNotes, 1_800) : ''
      const visualDirection = typeof candidate.visualDirection === 'string' ? clip(candidate.visualDirection, 220) : ''
      if (!title || !takeaway || !body.length) return null
      return { number: index + 1, title, takeaway, body, speakerNotes, visualDirection }
    })
    .filter((slide): slide is DeckSlide => Boolean(slide))
}

function addDeckFooter(slide: PptxGenJS.Slide, page: number, dark = false): void {
  const color = dark ? DECK_COLORS.white : DECK_COLORS.dusk
  slide.addText('ACTIVE CAMPAIGN · ENABLEMENT', {
    x: 0.5,
    y: 5.08,
    w: 3.4,
    h: 0.18,
    margin: 0,
    fontFace: DECK_BODY_FONT,
    fontSize: 6.5,
    bold: true,
    charSpacing: 0.8,
    color,
  })
  slide.addText(String(page).padStart(2, '0'), {
    x: 9.06,
    y: 5.03,
    w: 0.42,
    h: 0.22,
    margin: 0,
    fontFace: DECK_BODY_FONT,
    fontSize: 7,
    bold: true,
    align: 'right',
    color,
  })
}

function addDeckCover(slide: PptxGenJS.Slide, draft: AssetDraftContent, shapes: PptxGenJS['ShapeType']): void {
  slide.background = { color: DECK_COLORS.midnight }
  slide.addShape(shapes.arc, {
    x: 7.1,
    y: -0.45,
    w: 3.9,
    h: 3.9,
    rotate: 24,
    line: { color: DECK_COLORS.acBlue, width: 18 },
  })
  slide.addShape(shapes.rect, {
    x: 7.82,
    y: 3.23,
    w: 1.55,
    h: 1.55,
    fill: { color: DECK_COLORS.acBlue },
    line: { color: DECK_COLORS.acBlue },
    rotate: 13,
  })
  slide.addText('ENABLEMENT DO-ER', {
    x: 0.52,
    y: 0.53,
    w: 2.7,
    h: 0.23,
    margin: 0,
    fontFace: DECK_BODY_FONT,
    fontSize: 8,
    bold: true,
    charSpacing: 1.1,
    color: DECK_COLORS.mist,
  })
  slide.addText(clip(draft.title, 100), {
    x: 0.5,
    y: 1.24,
    w: 6.55,
    h: 1.85,
    margin: 0,
    breakLine: false,
    fontFace: DECK_HEADLINE_FONT,
    fontSize: 34,
    bold: true,
    fit: 'shrink',
    color: DECK_COLORS.white,
    valign: 'middle',
  })
  slide.addText(clip(draft.summary, 300), {
    x: 0.53,
    y: 3.47,
    w: 5.85,
    h: 0.92,
    margin: 0,
    fontFace: DECK_BODY_FONT,
    fontSize: 15,
    fit: 'shrink',
    color: DECK_COLORS.mist,
    breakLine: false,
  })
  addDeckFooter(slide, 1, true)
}

function addStatementSlide(
  slide: PptxGenJS.Slide,
  deckSlide: DeckSlide,
  page: number,
  shapes: PptxGenJS['ShapeType']
): void {
  slide.background = { color: DECK_COLORS.acBlue }
  slide.addShape(shapes.arc, {
    x: 6.92,
    y: 2.46,
    w: 3.15,
    h: 3.15,
    rotate: 28,
    line: { color: DECK_COLORS.mist, width: 15, transparency: 20 },
  })
  slide.addText(deckSlide.title.toUpperCase(), {
    x: 0.52,
    y: 0.55,
    w: 6.8,
    h: 0.26,
    margin: 0,
    fontFace: DECK_BODY_FONT,
    fontSize: 8,
    bold: true,
    charSpacing: 1.05,
    color: DECK_COLORS.mist,
  })
  slide.addText(deckSlide.takeaway, {
    x: 0.5,
    y: 1.25,
    w: 7.9,
    h: 2.8,
    margin: 0,
    fontFace: DECK_HEADLINE_FONT,
    fontSize: 31,
    bold: true,
    fit: 'shrink',
    color: DECK_COLORS.white,
    valign: 'middle',
  })
  addDeckFooter(slide, page, true)
}

function addDetailsSlide(
  slide: PptxGenJS.Slide,
  deckSlide: DeckSlide,
  page: number,
  shapes: PptxGenJS['ShapeType']
): void {
  slide.background = { color: DECK_COLORS.cream }
  slide.addShape(shapes.ellipse, {
    x: 7.78,
    y: 0.52,
    w: 1.76,
    h: 1.76,
    fill: { color: DECK_COLORS.lightBlue },
    line: { color: DECK_COLORS.lightBlue },
  })
  slide.addText(String(page).padStart(2, '0'), {
    x: 8.13,
    y: 0.94,
    w: 1.06,
    h: 0.38,
    margin: 0,
    align: 'center',
    fontFace: DECK_HEADLINE_FONT,
    fontSize: 20,
    bold: true,
    color: DECK_COLORS.acBlue,
  })
  slide.addText(deckSlide.title, {
    x: 0.5,
    y: 0.53,
    w: 6.6,
    h: 0.8,
    margin: 0,
    fontFace: DECK_HEADLINE_FONT,
    fontSize: 27,
    bold: true,
    fit: 'shrink',
    color: DECK_COLORS.dusk,
  })
  slide.addText(deckSlide.takeaway, {
    x: 0.52,
    y: 1.55,
    w: 4.0,
    h: 1.18,
    margin: 0,
    fontFace: DECK_BODY_FONT,
    fontSize: 15,
    bold: true,
    fit: 'shrink',
    color: DECK_COLORS.dusk,
  })
  slide.addText(
    deckSlide.body.map((item, index) => ({
      text: item,
      options: { bullet: { indent: 12 }, hanging: 3, breakLine: index < deckSlide.body.length - 1 },
    })),
    {
      x: 0.55,
      y: 3.08,
      w: 4.25,
      h: 1.4,
      margin: 0,
      breakLine: false,
      fontFace: DECK_BODY_FONT,
      fontSize: 11.5,
      fit: 'shrink',
      color: DECK_COLORS.dusk,
    }
  )
  slide.addShape(shapes.roundRect, {
    x: 5.25,
    y: 1.45,
    w: 4.1,
    h: 3.18,
    rectRadius: 0.08,
    fill: { color: DECK_COLORS.white },
    line: { color: DECK_COLORS.white },
  })
  slide.addText('VISUAL DIRECTION', {
    x: 5.65,
    y: 1.94,
    w: 2.5,
    h: 0.22,
    margin: 0,
    fontFace: DECK_BODY_FONT,
    fontSize: 7.5,
    bold: true,
    charSpacing: 1,
    color: DECK_COLORS.acBlue,
  })
  slide.addText(deckSlide.visualDirection || 'Use a simple visual that reinforces the learner action.', {
    x: 5.65,
    y: 2.37,
    w: 3.15,
    h: 1.05,
    margin: 0,
    fontFace: DECK_HEADLINE_FONT,
    fontSize: 17,
    bold: true,
    fit: 'shrink',
    color: DECK_COLORS.dusk,
  })
  slide.addText('Facilitator prompt', {
    x: 5.65,
    y: 3.76,
    w: 2.1,
    h: 0.18,
    margin: 0,
    fontFace: DECK_BODY_FONT,
    fontSize: 7.5,
    bold: true,
    charSpacing: 0.6,
    color: DECK_COLORS.acBlue,
  })
  slide.addText(clip(deckSlide.speakerNotes, 210), {
    x: 5.65,
    y: 4.04,
    w: 3.12,
    h: 0.42,
    margin: 0,
    fontFace: DECK_BODY_FONT,
    fontSize: 8.5,
    fit: 'shrink',
    color: DECK_COLORS.dusk,
  })
  addDeckFooter(slide, page)
}

function addCardsSlide(
  slide: PptxGenJS.Slide,
  deckSlide: DeckSlide,
  page: number,
  shapes: PptxGenJS['ShapeType']
): void {
  slide.background = { color: DECK_COLORS.lightBlue }
  slide.addText(deckSlide.title, {
    x: 0.5,
    y: 0.5,
    w: 7.7,
    h: 0.62,
    margin: 0,
    fontFace: DECK_HEADLINE_FONT,
    fontSize: 26,
    bold: true,
    fit: 'shrink',
    color: DECK_COLORS.dusk,
  })
  slide.addText(deckSlide.takeaway, {
    x: 0.52,
    y: 1.25,
    w: 7.9,
    h: 0.55,
    margin: 0,
    fontFace: DECK_BODY_FONT,
    fontSize: 13.5,
    bold: true,
    fit: 'shrink',
    color: DECK_COLORS.dusk,
  })
  const cards = deckSlide.body.slice(0, 3)
  const cardWidth = 2.75
  const gap = 0.24
  cards.forEach((item, index) => {
    const x = 0.52 + index * (cardWidth + gap)
    slide.addShape(shapes.roundRect, {
      x,
      y: 2.22,
      w: cardWidth,
      h: 2.08,
      rectRadius: 0.08,
      fill: { color: index === 1 ? DECK_COLORS.acBlue : DECK_COLORS.white },
      line: { color: index === 1 ? DECK_COLORS.acBlue : DECK_COLORS.white },
    })
    slide.addText(String(index + 1).padStart(2, '0'), {
      x: x + 0.25,
      y: 2.52,
      w: 0.42,
      h: 0.23,
      margin: 0,
      fontFace: DECK_BODY_FONT,
      fontSize: 8,
      bold: true,
      color: index === 1 ? DECK_COLORS.mist : DECK_COLORS.acBlue,
    })
    slide.addText(item, {
      x: x + 0.25,
      y: 3.04,
      w: cardWidth - 0.5,
      h: 0.9,
      margin: 0,
      fontFace: DECK_HEADLINE_FONT,
      fontSize: 15.5,
      bold: true,
      fit: 'shrink',
      color: index === 1 ? DECK_COLORS.white : DECK_COLORS.dusk,
      valign: 'middle',
    })
  })
  addDeckFooter(slide, page)
}

async function renderPowerPointDeck(draft: AssetDraftContent): Promise<Uint8Array> {
  const slides = normalizeDeckSlides(draft.slides)
  if (!slides.length) throw new Error('deck output omitted complete slides')

  const presentation = new PptxGenJS()
  presentation.layout = 'LAYOUT_16x9'
  presentation.author = 'ActiveCampaign Enablement Do-er'
  presentation.company = 'ActiveCampaign'
  presentation.subject = 'Enablement asset draft'
  presentation.title = clip(draft.title, 180)
  presentation.theme = { headFontFace: DECK_HEADLINE_FONT, bodyFontFace: DECK_BODY_FONT }

  const cover = presentation.addSlide()
  addDeckCover(cover, draft, presentation.ShapeType)

  slides.forEach((deckSlide, index) => {
    const page = index + 2
    const slide = presentation.addSlide()
    if (index % 3 === 2) addStatementSlide(slide, deckSlide, page, presentation.ShapeType)
    else if (index % 3 === 1) addCardsSlide(slide, deckSlide, page, presentation.ShapeType)
    else addDetailsSlide(slide, deckSlide, page, presentation.ShapeType)
    if (deckSlide.speakerNotes) slide.addNotes(deckSlide.speakerNotes)
  })

  const output = await presentation.write({ outputType: 'nodebuffer', compression: true })
  return output instanceof Uint8Array ? output : new Uint8Array(output as ArrayBuffer)
}

function plainText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
}

function markdownParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = []
  for (const rawLine of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line || /^---+$/.test(line)) continue

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      paragraphs.push(
        new Paragraph({
          heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          children: [new TextRun(plainText(heading[2]))],
        })
      )
      continue
    }

    const bullet = line.match(/^[-*+]\s+(.+)$/)
    if (bullet) {
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'asset-bullets', level: 0 },
          children: [new TextRun(plainText(bullet[1]))],
        })
      )
      continue
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/)
    if (numbered) {
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'asset-numbers', level: 0 },
          children: [new TextRun(plainText(numbered[1]))],
        })
      )
      continue
    }

    paragraphs.push(new Paragraph({ children: [new TextRun(plainText(line))] }))
  }
  return paragraphs
}

async function renderWordDocument(draft: AssetDraftContent): Promise<Uint8Array> {
  const document = new Document({
    creator: 'ActiveCampaign Enablement Do-er',
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 30, bold: true, font: 'Arial' },
          paragraph: { spacing: { before: 300, after: 180 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'asset-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
        {
          reference: 'asset-numbers',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: plainText(draft.title), bold: true, size: 40, font: 'Arial' })],
          }),
          new Paragraph({
            children: [new TextRun({ text: plainText(draft.summary), italics: true, color: '444444' })],
            spacing: { after: 300 },
          }),
          ...markdownParagraphs(draft.markdown),
        ],
      },
    ],
  })
  return Packer.toBuffer(document)
}

function sourceArtifact(deliverableType: DeliverableType, draft: AssetDraftContent): DraftArtifactPayload {
  if (deliverableType === 'DECK') {
    return {
      kind: 'DECK_STORYBOARD',
      fileName: assetArtifactFileName(draft.title, 'DECK_STORYBOARD'),
      content: JSON.stringify(
        {
          title: draft.title,
          summary: draft.summary,
          markdown: draft.markdown,
          slides: draft.slides,
          format: 'enablement-doer-deck-storyboard/v1',
        },
        null,
        2
      ),
      contentType: 'application/json; charset=utf-8',
    }
  }
  return {
    kind: 'MARKDOWN',
    fileName: assetArtifactFileName(draft.title, 'MARKDOWN'),
    content: draft.markdown,
    contentType: 'text/markdown; charset=utf-8',
  }
}

export async function artifactPayloadsForDraft(
  deliverableType: DeliverableType,
  draft: AssetDraftContent
): Promise<DraftArtifactPayload[]> {
  const source = sourceArtifact(deliverableType, draft)
  if (deliverableType === 'DECK') {
    return [
      source,
      {
        kind: 'PPTX',
        fileName: assetArtifactFileName(draft.title, 'PPTX'),
        content: await renderPowerPointDeck(draft),
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
    ]
  }

  return [
    source,
    {
      kind: 'DOCX',
      fileName: assetArtifactFileName(draft.title, 'DOCX'),
      content: await renderWordDocument(draft),
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  ]
}
