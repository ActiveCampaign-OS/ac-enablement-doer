import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: false })

// Minimal hardening for an internal preview / clipboard payload. The source is
// our own model's help-article Markdown (behind SSO), so this just strips the
// obvious script-y vectors rather than running a full sanitizer dependency.
function harden(html: string): string {
  return html
    .replace(/<\/?(?:script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

function safeFromCodePoint(n: number): string {
  try {
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
  } catch {
    return ''
  }
}

/**
 * Decode the HTML entities that show up in Zendesk article bodies (which arrive
 * as HTML). Without this, `&quot;` etc. render literally AND make the update-draft
 * change-diff treat every quote as an edit (it compares entity-encoded original
 * text against the clean Markdown draft). Decode `&amp;` LAST so we don't
 * double-decode (e.g. `&amp;lt;` must stay `&lt;`, not become `<`).
 */
export function decodeHtmlEntities(s: string): string {
  return (s ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Convert an AI article draft (Markdown) into clean HTML that pastes into
 * Zendesk's rich-text editor with formatting intact (headings, bold, lists,
 * links, tables) — so the docs team doesn't have to reformat.
 *
 * Demotes H1 -> H2: the Zendesk article title is a separate field, so body
 * content should start at H2.
 */
export function markdownToZendeskHtml(md: string): string {
  const html = marked.parse(md ?? '', { async: false }) as string
  return harden(html)
    .replace(/<(\/?)h1(\s|>)/gi, '<$1h2$2')
    .trim()
}

/** Plain text of a Markdown draft (tags stripped) — used for diffing a revised
 *  draft against the article's existing bodyText. */
export function markdownToPlainText(md: string): string {
  return decodeHtmlEntities(markdownToZendeskHtml(md).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}
