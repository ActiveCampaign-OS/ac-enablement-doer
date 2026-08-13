import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import JSZip from 'jszip'
import { imageSize } from 'image-size'

const [templatePath, ...args] = process.argv.slice(2)
const outputIndex = args.indexOf('--output')
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : 'docs/ac-2026-template-asset-inventory.json'

if (!templatePath || !outputPath) {
  console.error('Usage: node scripts/inventory-pptx-template.mjs <template.pptx> --output <manifest.json>')
  process.exit(1)
}

const rawTemplate = await readFile(templatePath)
const zip = await JSZip.loadAsync(rawTemplate)
const names = Object.keys(zip.files)

function xmlText(xml) {
  return xml
    .replace(/<a:br\s*\/>/g, ' ')
    .match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)
    ?.map((entry) => entry.replace(/^<a:t[^>]*>|<\/a:t>$/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() ?? ''
}

function usageCategory(slideNumber, slideText) {
  const text = slideText.toLowerCase()
  const compactText = text.replace(/\s+/g, '')
  if (compactText.includes('activecampaignlogos')) return 'activecampaign_logo_reference'
  if (text.includes('postmark logos') || text.includes('frequently used logos')) return 'third_party_logo_reference'
  if (text.includes('app integration icons')) return 'integration_icon_reference'
  if (text.includes('small spot illustrations') || text.includes('medium spot illustrations')) return 'spot_illustration_reference'
  if (text.includes('arrows illustrations') || text.includes('starburst illustrations')) return 'graphic_reference'
  if (text.includes('product illustrations') || text.includes('conceptual illustration')) return 'illustration_reference'
  if (slideNumber >= 71 && slideNumber <= 76) return 'cover_layout_reference'
  if (slideNumber >= 77 && slideNumber <= 78) return 'speaker_layout_reference'
  if (slideNumber >= 79 && slideNumber <= 111) return 'section_break_layout_reference'
  if (slideNumber >= 112) return 'content_layout_reference'
  return 'template_reference'
}

function createMediaRecord(fileName, data, slideReferences) {
  let dimensions = null
  try {
    const size = imageSize(data)
    dimensions = size.width && size.height ? { width: size.width, height: size.height } : null
  } catch {
    // Some Office media assets are not formats image-size recognizes. They remain referenceable.
  }
  return {
    templateMediaPath: fileName,
    fileName: path.basename(fileName),
    contentType: contentTypeFor(fileName),
    bytes: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'),
    dimensions,
    references: slideReferences.map((reference) => ({
      slideNumber: reference.slideNumber,
      slideText: reference.slideText.slice(0, 280),
      usageCategory: usageCategory(reference.slideNumber, reference.slideText),
    })),
    reuseStatus: 'REFERENCE_ONLY_PENDING_BRAND_REVIEW',
    extractionStatus: 'NOT_BUNDLED',
  }
}

function contentTypeFor(fileName) {
  const extension = path.extname(fileName).toLowerCase()
  const types = {
    '.emf': 'image/emf',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.wmf': 'image/wmf',
  }
  return types[extension] ?? 'application/octet-stream'
}

const slides = []
const mediaToSlides = new Map()
for (const name of names.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry))) {
  const slideNumber = Number(name.match(/slide(\d+)\.xml$/)?.[1])
  const slideXml = await zip.file(name)?.async('string')
  const relPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`
  const relXml = (await zip.file(relPath)?.async('string')) ?? ''
  const slideText = xmlText(slideXml ?? '')
  const mediaPaths = Array.from(relXml.matchAll(/Target="\.\.\/media\/([^\"]+)"/g)).map((match) => `ppt/media/${match[1]}`)
  slides.push({
    slideNumber,
    slideText: slideText.slice(0, 600),
    usageCategory: usageCategory(slideNumber, slideText),
    mediaPaths,
  })
  for (const mediaPath of mediaPaths) {
    const references = mediaToSlides.get(mediaPath) ?? []
    references.push({ slideNumber, slideText })
    mediaToSlides.set(mediaPath, references)
  }
}

const media = []
for (const [mediaPath, references] of mediaToSlides) {
  const file = zip.file(mediaPath)
  if (!file) continue
  media.push(createMediaRecord(mediaPath, await file.async('nodebuffer'), references))
}

const manifest = {
  format: 'enablement-doer/ac-2026-template-inventory/v1',
  generatedAt: new Date().toISOString(),
  template: {
    fileName: path.basename(templatePath),
    bytes: rawTemplate.byteLength,
    sha256: createHash('sha256').update(rawTemplate).digest('hex'),
    slideCount: slides.length,
  },
  policy: {
    purpose: 'References the supplied 2026 presentation template without bundling its media into the app.',
    reuseRule:
      'An entry is not cleared for agent reuse until a Brand/Design owner verifies provenance, intended use, and any third-party mark or stock-image restrictions.',
    currentRenderer:
      'Uses only documented type, color, and shape treatments. It does not embed template media or third-party logos.',
  },
  slideLayouts: slides
    .filter((slide) => /layout_reference$/.test(slide.usageCategory))
    .map((slide) => ({
      slideNumber: slide.slideNumber,
      usageCategory: slide.usageCategory,
      label: slide.slideText.slice(0, 280),
      reuseStatus: 'STYLE_REFERENCE_ONLY',
    })),
  media,
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${outputPath}: ${slides.length} slides, ${media.length} referenced media assets`)
