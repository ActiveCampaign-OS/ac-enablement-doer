import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import type { AssetArtifactKind, DeliverableType } from '@prisma/client'
import { assetArtifactFileName } from './asset-builds'
import { renderNativePowerPointDeck } from './native-pptx'

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

async function renderPowerPointDeck(draft: AssetDraftContent): Promise<Uint8Array> {
  const slides = normalizeDeckSlides(draft.slides)
  if (!slides.length) throw new Error('deck output omitted complete slides')
  return renderNativePowerPointDeck({ title: clip(draft.title, 100), summary: clip(draft.summary, 300), slides })
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
