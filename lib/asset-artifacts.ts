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
  if (deliverableType === 'DECK') return [source]

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
