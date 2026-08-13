import JSZip from 'jszip'

export interface NativePowerPointDraft {
  title: string
  summary: string
  slides: NativePowerPointSlide[]
}

export interface NativePowerPointSlide {
  number: number
  title: string
  takeaway: string
  body: string[]
  speakerNotes: string
  visualDirection: string
}

const COLORS = {
  midnight: '00002D',
  dusk: '003343',
  acBlue: '0022D2',
  lightBlue: 'F3FAFF',
  cream: 'FBF9F3',
  white: 'FFFFFF',
  mist: 'D8F3FF',
} as const

const HEADLINE_FONT = 'Arimo'
const BODY_FONT = 'IBM Plex Sans'
const EMU_PER_INCH = 914_400
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

type ShapeType = 'arc' | 'ellipse' | 'rect' | 'roundRect'
type HorizontalAlignment = 'center' | 'left' | 'right'
type VerticalAlignment = 'bottom' | 'middle' | 'top'

interface ShapeOptions {
  x: number
  y: number
  width: number
  height: number
  fill?: string
  lineColor?: string
  lineWidth?: number
  rotate?: number
}

interface TextOptions {
  x: number
  y: number
  width: number
  height: number
  color: string
  font: string
  fontSize: number
  bold?: boolean
  characterSpacing?: number
  align?: HorizontalAlignment
  valign?: VerticalAlignment
  bullets?: boolean
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function emu(value: number): number {
  return Math.round(value * EMU_PER_INCH)
}

function solidFill(color?: string): string {
  return color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : '<a:noFill/>'
}

function horizontalAlignment(value: HorizontalAlignment = 'left'): string {
  return value === 'center' ? 'ctr' : value === 'right' ? 'r' : 'l'
}

function verticalAlignment(value: VerticalAlignment = 'top'): string {
  return value === 'middle' ? 'ctr' : value === 'bottom' ? 'b' : 't'
}

function shapeXml(id: number, type: ShapeType, options: ShapeOptions): string {
  const rotation = options.rotate ? ` rot="${Math.round(options.rotate * 60_000)}"` : ''
  const line = options.lineColor
    ? `<a:ln w="${Math.round((options.lineWidth ?? 1) * 12_700)}">${solidFill(options.lineColor)}<a:prstDash val="solid"/></a:ln>`
    : '<a:ln><a:noFill/></a:ln>'
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${rotation}><a:off x="${emu(options.x)}" y="${emu(options.y)}"/><a:ext cx="${emu(options.width)}" cy="${emu(options.height)}"/></a:xfrm><a:prstGeom prst="${type}"><a:avLst/></a:prstGeom>${solidFill(options.fill)}${line}</p:spPr></p:sp>`
}

function textParagraphXml(value: string, options: TextOptions): string {
  const paragraphProperties = options.bullets
    ? `<a:pPr algn="${horizontalAlignment(options.align)}" marL="190500" indent="-95250"><a:buChar char="•"/></a:pPr>`
    : `<a:pPr algn="${horizontalAlignment(options.align)}" marL="0" indent="0"><a:buNone/></a:pPr>`
  const characterSpacing = options.characterSpacing ? ` spc="${Math.round(options.characterSpacing * 100)}"` : ''
  const bold = options.bold ? ' b="1"' : ''
  const runProperties = `<a:rPr lang="en-US" sz="${Math.round(options.fontSize * 100)}"${bold}${characterSpacing}><a:solidFill><a:srgbClr val="${options.color}"/></a:solidFill><a:latin typeface="${options.font}"/><a:ea typeface="${options.font}"/><a:cs typeface="${options.font}"/></a:rPr>`
  return `<a:p>${paragraphProperties}<a:r>${runProperties}<a:t>${escapeXml(value)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${Math.round(options.fontSize * 100)}"/></a:p>`
}

function textXml(id: number, value: string | string[], options: TextOptions): string {
  const paragraphs = (Array.isArray(value) ? value : value.split(/\n+/))
    .filter(Boolean)
    .map((paragraph) => textParagraphXml(paragraph, options))
    .join('')
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(options.x)}" y="${emu(options.y)}"/><a:ext cx="${emu(options.width)}" cy="${emu(options.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${verticalAlignment(options.valign)}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs || textParagraphXml(' ', options)}</p:txBody></p:sp>`
}

class SlideBuilder {
  private readonly children: string[] = []
  private nextShapeId = 2

  addShape(type: ShapeType, options: ShapeOptions): void {
    this.children.push(shapeXml(this.nextShapeId++, type, options))
  }

  addText(value: string | string[], options: TextOptions): void {
    this.children.push(textXml(this.nextShapeId++, value, options))
  }

  xml(name: string, background: string): string {
    return `${XML_DECLARATION}<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="${escapeXml(name)}"><p:bg><p:bgPr>${solidFill(background)}</p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${this.children.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  }
}

function addDeckFooter(slide: SlideBuilder, page: number, dark = false): void {
  const color = dark ? COLORS.white : COLORS.dusk
  slide.addText('ACTIVE CAMPAIGN · ENABLEMENT', {
    x: 0.5,
    y: 5.08,
    width: 3.4,
    height: 0.18,
    color,
    font: BODY_FONT,
    fontSize: 6.5,
    bold: true,
    characterSpacing: 0.8,
  })
  slide.addText(String(page).padStart(2, '0'), {
    x: 9.06,
    y: 5.03,
    width: 0.42,
    height: 0.22,
    color,
    font: BODY_FONT,
    fontSize: 7,
    bold: true,
    align: 'right',
  })
}

function coverSlide(draft: NativePowerPointDraft): { notes: string; xml: string } {
  const slide = new SlideBuilder()
  slide.addShape('arc', { x: 7.1, y: -0.45, width: 3.9, height: 3.9, lineColor: COLORS.acBlue, lineWidth: 18, rotate: 24 })
  slide.addShape('rect', { x: 7.82, y: 3.23, width: 1.55, height: 1.55, fill: COLORS.acBlue, rotate: 13 })
  slide.addText('ENABLEMENT DO-ER', {
    x: 0.52,
    y: 0.53,
    width: 2.7,
    height: 0.23,
    color: COLORS.mist,
    font: BODY_FONT,
    fontSize: 8,
    bold: true,
    characterSpacing: 1.1,
  })
  slide.addText(draft.title, {
    x: 0.5,
    y: 1.24,
    width: 6.55,
    height: 1.85,
    color: COLORS.white,
    font: HEADLINE_FONT,
    fontSize: 34,
    bold: true,
    valign: 'middle',
  })
  slide.addText(draft.summary, {
    x: 0.53,
    y: 3.47,
    width: 5.85,
    height: 0.92,
    color: COLORS.mist,
    font: BODY_FONT,
    fontSize: 15,
  })
  addDeckFooter(slide, 1, true)
  return { notes: draft.summary, xml: slide.xml('Slide 1', COLORS.midnight) }
}

function statementSlide(deckSlide: NativePowerPointSlide, page: number): { notes: string; xml: string } {
  const slide = new SlideBuilder()
  slide.addShape('arc', { x: 6.92, y: 2.46, width: 3.15, height: 3.15, lineColor: COLORS.mist, lineWidth: 15, rotate: 28 })
  slide.addText(deckSlide.title.toUpperCase(), {
    x: 0.52,
    y: 0.55,
    width: 6.8,
    height: 0.26,
    color: COLORS.mist,
    font: BODY_FONT,
    fontSize: 8,
    bold: true,
    characterSpacing: 1.05,
  })
  slide.addText(deckSlide.takeaway, {
    x: 0.5,
    y: 1.25,
    width: 7.9,
    height: 2.8,
    color: COLORS.white,
    font: HEADLINE_FONT,
    fontSize: 31,
    bold: true,
    valign: 'middle',
  })
  addDeckFooter(slide, page, true)
  return { notes: deckSlide.speakerNotes, xml: slide.xml(`Slide ${page}`, COLORS.acBlue) }
}

function detailsSlide(deckSlide: NativePowerPointSlide, page: number): { notes: string; xml: string } {
  const slide = new SlideBuilder()
  slide.addShape('ellipse', { x: 7.78, y: 0.52, width: 1.76, height: 1.76, fill: COLORS.lightBlue })
  slide.addText(String(page).padStart(2, '0'), {
    x: 8.13,
    y: 0.94,
    width: 1.06,
    height: 0.38,
    color: COLORS.acBlue,
    font: HEADLINE_FONT,
    fontSize: 20,
    bold: true,
    align: 'center',
  })
  slide.addText(deckSlide.title, {
    x: 0.5,
    y: 0.53,
    width: 6.6,
    height: 0.8,
    color: COLORS.dusk,
    font: HEADLINE_FONT,
    fontSize: 27,
    bold: true,
  })
  slide.addText(deckSlide.takeaway, {
    x: 0.52,
    y: 1.55,
    width: 4,
    height: 1.18,
    color: COLORS.dusk,
    font: BODY_FONT,
    fontSize: 15,
    bold: true,
  })
  slide.addText(deckSlide.body, {
    x: 0.55,
    y: 3.08,
    width: 4.25,
    height: 1.4,
    color: COLORS.dusk,
    font: BODY_FONT,
    fontSize: 11.5,
    bullets: true,
  })
  slide.addShape('roundRect', { x: 5.25, y: 1.45, width: 4.1, height: 3.18, fill: COLORS.white })
  slide.addText('VISUAL DIRECTION', {
    x: 5.65,
    y: 1.94,
    width: 2.5,
    height: 0.22,
    color: COLORS.acBlue,
    font: BODY_FONT,
    fontSize: 7.5,
    bold: true,
    characterSpacing: 1,
  })
  slide.addText(deckSlide.visualDirection || 'Use a simple visual that reinforces the learner action.', {
    x: 5.65,
    y: 2.37,
    width: 3.15,
    height: 1.05,
    color: COLORS.dusk,
    font: HEADLINE_FONT,
    fontSize: 17,
    bold: true,
  })
  slide.addText('Facilitator prompt', {
    x: 5.65,
    y: 3.76,
    width: 2.1,
    height: 0.18,
    color: COLORS.acBlue,
    font: BODY_FONT,
    fontSize: 7.5,
    bold: true,
    characterSpacing: 0.6,
  })
  slide.addText(deckSlide.speakerNotes, {
    x: 5.65,
    y: 4.04,
    width: 3.12,
    height: 0.42,
    color: COLORS.dusk,
    font: BODY_FONT,
    fontSize: 8.5,
  })
  addDeckFooter(slide, page)
  return { notes: deckSlide.speakerNotes, xml: slide.xml(`Slide ${page}`, COLORS.cream) }
}

function cardsSlide(deckSlide: NativePowerPointSlide, page: number): { notes: string; xml: string } {
  const slide = new SlideBuilder()
  slide.addText(deckSlide.title, {
    x: 0.5,
    y: 0.5,
    width: 7.7,
    height: 0.62,
    color: COLORS.dusk,
    font: HEADLINE_FONT,
    fontSize: 26,
    bold: true,
  })
  slide.addText(deckSlide.takeaway, {
    x: 0.52,
    y: 1.25,
    width: 7.9,
    height: 0.55,
    color: COLORS.dusk,
    font: BODY_FONT,
    fontSize: 13.5,
    bold: true,
  })
  deckSlide.body.slice(0, 3).forEach((item, index) => {
    const x = 0.52 + index * 2.99
    const darkCard = index === 1
    slide.addShape('roundRect', { x, y: 2.22, width: 2.75, height: 2.08, fill: darkCard ? COLORS.acBlue : COLORS.white })
    slide.addText(String(index + 1).padStart(2, '0'), {
      x: x + 0.25,
      y: 2.52,
      width: 0.42,
      height: 0.23,
      color: darkCard ? COLORS.mist : COLORS.acBlue,
      font: BODY_FONT,
      fontSize: 8,
      bold: true,
    })
    slide.addText(item, {
      x: x + 0.25,
      y: 3.04,
      width: 2.25,
      height: 0.9,
      color: darkCard ? COLORS.white : COLORS.dusk,
      font: HEADLINE_FONT,
      fontSize: 15.5,
      bold: true,
      valign: 'middle',
    })
  })
  addDeckFooter(slide, page)
  return { notes: deckSlide.speakerNotes, xml: slide.xml(`Slide ${page}`, COLORS.lightBlue) }
}

function slideRelationshipXml(index: number): string {
  return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${index}.xml"/></Relationships>`
}

function notesSlideXml(index: number, notes: string): string {
  return `${XML_DECLARATION}<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${escapeXml(notes || 'Facilitator notes not provided.')}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
}

function notesRelationshipXml(index: number): string {
  return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${index}.xml"/></Relationships>`
}

function contentTypesXml(slideCount: number): string {
  const slides = Array.from({ length: slideCount }, (_, index) => {
    const number = index + 1
    return `<Override PartName="/ppt/slides/slide${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/notesSlides/notesSlide${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
  }).join('')
  return `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>${slides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`
}

function themeXml(): string {
  return `${XML_DECLARATION}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="ActiveCampaign"><a:themeElements><a:clrScheme name="ActiveCampaign"><a:dk1><a:srgbClr val="00002D"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="003343"/></a:dk2><a:lt2><a:srgbClr val="F3FAFF"/></a:lt2><a:accent1><a:srgbClr val="0022D2"/></a:accent1><a:accent2><a:srgbClr val="D8F3FF"/></a:accent2><a:accent3><a:srgbClr val="FBF9F3"/></a:accent3><a:accent4><a:srgbClr val="003343"/></a:accent4><a:accent5><a:srgbClr val="00002D"/></a:accent5><a:accent6><a:srgbClr val="FFFFFF"/></a:accent6><a:hlink><a:srgbClr val="0022D2"/></a:hlink><a:folHlink><a:srgbClr val="003343"/></a:folHlink></a:clrScheme><a:fontScheme name="ActiveCampaign"><a:majorFont><a:latin typeface="Arimo"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="IBM Plex Sans"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="ActiveCampaign"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
}

function slideMasterXml(): string {
  return `${XML_DECLARATION}<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:hf sldNum="0" hdr="0" ftr="0" dt="0"/><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`
}

function slideLayoutXml(): string {
  return `${XML_DECLARATION}<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" preserve="1"><p:cSld name="DEFAULT"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
}

function notesMasterXml(): string {
  return `${XML_DECLARATION}<p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr marL="0"><a:defRPr sz="1200"/></a:lvl1pPr></p:notesStyle></p:notesMaster>`
}

function presentationXml(slideCount: number): string {
  const slideIds = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join('')
  return `${XML_DECLARATION}<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1" autoCompressPictures="0"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId${slideCount + 2}"/></p:notesMasterIdLst><p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="5143500" cy="9144000"/><p:defaultTextStyle/></p:presentation>`
}

function presentationRelationshipsXml(slideCount: number): string {
  const slides = Array.from({ length: slideCount }, (_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join('')
  const notesMasterId = slideCount + 2
  return `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides}<Relationship Id="rId${notesMasterId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/><Relationship Id="rId${notesMasterId + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/><Relationship Id="rId${notesMasterId + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/><Relationship Id="rId${notesMasterId + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId${notesMasterId + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/></Relationships>`
}

function corePropertiesXml(draft: NativePowerPointDraft): string {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  return `${XML_DECLARATION}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(draft.title)}</dc:title><dc:subject>Enablement asset draft</dc:subject><dc:creator>ActiveCampaign Enablement Do-er</dc:creator><cp:lastModifiedBy>ActiveCampaign Enablement Do-er</cp:lastModifiedBy><cp:revision>1</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`
}

function appPropertiesXml(slideCount: number): string {
  return `${XML_DECLARATION}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office PowerPoint</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${slideCount}</Slides><Notes>${slideCount}</Notes><Company>ActiveCampaign</Company><AppVersion>16.0000</AppVersion></Properties>`
}

export async function renderNativePowerPointDeck(draft: NativePowerPointDraft): Promise<Uint8Array> {
  const slides = [coverSlide(draft)]
  draft.slides.forEach((deckSlide, index) => {
    const page = index + 2
    slides.push(index % 3 === 2 ? statementSlide(deckSlide, page) : index % 3 === 1 ? cardsSlide(deckSlide, page) : detailsSlide(deckSlide, page))
  })

  const zip = new JSZip()
  zip.file('[Content_Types].xml', contentTypesXml(slides.length))
  zip.file('_rels/.rels', `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`)
  zip.file('docProps/app.xml', appPropertiesXml(slides.length))
  zip.file('docProps/core.xml', corePropertiesXml(draft))
  zip.file('ppt/presentation.xml', presentationXml(slides.length))
  zip.file('ppt/_rels/presentation.xml.rels', presentationRelationshipsXml(slides.length))
  zip.file('ppt/presProps.xml', `${XML_DECLARATION}<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`)
  zip.file('ppt/viewProps.xml', `${XML_DECLARATION}<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`)
  zip.file('ppt/tableStyles.xml', `${XML_DECLARATION}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`)
  zip.file('ppt/theme/theme1.xml', themeXml())
  zip.file('ppt/slideMasters/slideMaster1.xml', slideMasterXml())
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`)
  zip.file('ppt/slideLayouts/slideLayout1.xml', slideLayoutXml())
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`)
  zip.file('ppt/notesMasters/notesMaster1.xml', notesMasterXml())
  zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels', `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`)

  slides.forEach((slide, index) => {
    const number = index + 1
    zip.file(`ppt/slides/slide${number}.xml`, slide.xml)
    zip.file(`ppt/slides/_rels/slide${number}.xml.rels`, slideRelationshipXml(number))
    zip.file(`ppt/notesSlides/notesSlide${number}.xml`, notesSlideXml(number, slide.notes))
    zip.file(`ppt/notesSlides/_rels/notesSlide${number}.xml.rels`, notesRelationshipXml(number))
  })

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}
