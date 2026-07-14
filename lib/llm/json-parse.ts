/**
 * Tolerant JSON parser for LLM responses.
 *
 * Claude occasionally returns JSON with small syntactic mistakes that
 * blow up native JSON.parse — trailing commas, truncation when the
 * response hits the max-tokens ceiling. The audit pipeline currently
 * throws on every one of these and loses the entire response.
 *
 * Observed in production logs 2026-05-28:
 *   [analyze-articles] Error analyzing article cmp7cblqb…:
 *     SyntaxError: Expected ',' or '}' after property value in JSON
 *     at position 1462 (line 15 column 120)
 *
 * Strategy: regex-extract the JSON block, then try a sequence of
 * progressively-more-aggressive recoveries. Each attempt returns the
 * parsed value on success or `null` if everything fails — callers
 * just check for null and move on, no try/catch needed.
 */

type Shape = 'array' | 'object'

export function parseLLMJson<T>(rawText: string, shape: Shape): T | null {
  if (!rawText) return null

  const pattern = shape === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/
  const match = rawText.match(pattern)
  if (!match) return null
  const candidate = match[0]

  // 1) Clean parse — most responses hit this path.
  try {
    return JSON.parse(candidate) as T
  } catch {
    // continue
  }

  // 2) Strip trailing commas before } or ] — Claude's most common
  // mistake. ", \n]" → "\n]"
  const stripped = candidate.replace(/,(\s*[}\]])/g, '$1')
  try {
    return JSON.parse(stripped) as T
  } catch {
    // continue
  }

  // 3) Truncation recovery — for arrays, walk back to the last
  // balanced top-level element and close with ']'. Object truncation
  // is harder to recover cleanly and we don't attempt it here.
  if (shape === 'array') {
    const recovered = recoverTruncatedArray(stripped)
    if (recovered !== null) {
      try {
        return JSON.parse(recovered) as T
      } catch {
        // give up
      }
    }
  }

  return null
}

function recoverTruncatedArray(s: string): string | null {
  if (!s.startsWith('[')) return null
  let depth = 0
  let lastCompleteElementEnd = -1
  let inString = false
  let escapeNext = false

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (c === '\\' && inString) {
      escapeNext = true
      continue
    }
    if (c === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 1 && c === '}') {
        lastCompleteElementEnd = i
      }
      if (depth === 0) return null // whole array closed; no recovery needed
    }
  }

  if (lastCompleteElementEnd < 0) return null
  return s.slice(0, lastCompleteElementEnd + 1) + ']'
}
