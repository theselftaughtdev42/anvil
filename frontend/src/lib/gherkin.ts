/**
 * What a piece of a Gherkin line is, for highlighting. Plain text has no kind.
 * `narrative` is the "As a", "I want", "So that" or "Out of scope:" that opens a
 * description line, and `description` the rest of a description.
 */
export type GherkinKind =
  | 'keyword'
  | 'title'
  | 'step'
  | 'string'
  | 'placeholder'
  | 'pipe'
  | 'cell'
  | 'comment'
  | 'narrative'
  | 'description'

export type GherkinToken = { text: string; kind?: GherkinKind }

const HEADER = /^(\s*)(Feature|Background|Rule|Scenario Outline|Scenario|Examples)(:)(\s*)(.*)$/
const STEP = /^(\s*)(Given|When|Then|And|But)(\s.*)$/
const NARRATIVE = /^(\s*)((?:As an?|I want|So that)\b|Out of scope:)(.*)$/

/**
 * Splits Gherkin, as `render_gherkin` writes it, into lines of tokens. The
 * tokens of each line join back into the line exactly, without its newline.
 */
export function tokenizeGherkin(content: string): GherkinToken[][] {
  const lines = content.split('\n')
  if (content.endsWith('\n')) lines.pop()
  return lines.map(tokenizeLine)
}

function tokenizeLine(line: string): GherkinToken[] {
  let match
  if (/^\s*#/.test(line)) return [{ text: line, kind: 'comment' }]
  if (/^\s*\|/.test(line)) return tokenizeRow(line)
  if ((match = HEADER.exec(line))) {
    const [, indent, keyword, colon, space, title] = match
    return plain(indent, { text: keyword + colon, kind: 'keyword' }, space, { text: title, kind: 'title' })
  }
  if ((match = STEP.exec(line))) {
    const [, indent, keyword, text] = match
    return plain(indent, { text: keyword, kind: 'step' }, ...inline(text))
  }
  if ((match = NARRATIVE.exec(line))) {
    const [, indent, opening, rest] = match
    return plain(indent, { text: opening, kind: 'narrative' }, { text: rest, kind: 'description' })
  }
  return line.trim() ? [{ text: line, kind: 'description' }] : plain(line)
}

/** An Examples row: pipes and cells, where `\|` is a pipe inside a cell. */
function tokenizeRow(line: string): GherkinToken[] {
  const tokens: GherkinToken[] = []
  let cell = ''
  const flush = () => {
    const [, lead, text, trail] = /^(\s*)(.*?)(\s*)$/.exec(cell)!
    tokens.push(...plain(lead), ...inline(text, 'cell'), ...plain(trail))
    cell = ''
  }
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && i + 1 < line.length) {
      cell += line[i] + line[++i]
    } else if (line[i] === '|') {
      flush()
      tokens.push({ text: '|', kind: 'pipe' })
    } else {
      cell += line[i]
    }
  }
  flush()
  return tokens
}

/** Text with its "strings" and <placeholders> picked out. */
function inline(text: string, kind?: GherkinKind): GherkinToken[] {
  return text.split(/("[^"]*")/).flatMap((part) => {
    const partKind = part.startsWith('"') ? 'string' : kind
    return plain(
      ...part.split(/(<[^<>\s]+>)/).map((piece): GherkinToken | string => {
        if (piece.startsWith('<')) return { text: piece, kind: 'placeholder' }
        return partKind ? { text: piece, kind: partKind } : piece
      }),
    )
  })
}

/** Drops empty tokens, and turns strings into plain ones. */
function plain(...tokens: (GherkinToken | string)[]): GherkinToken[] {
  return tokens.map((token) => (typeof token === 'string' ? { text: token } : token)).filter((token) => token.text)
}

/**
 * The file name a Requirement's Output downloads as: its title as a slug, such
 * as "rebook-a-missed-delivery.feature".
 */
export function featureFilename(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '')
  return `${slug || 'requirement'}.feature`
}
