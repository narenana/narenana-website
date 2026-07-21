// Regenerate catalog/lib/styles.mjs from catalog/catalog.css (single source of
// truth for CSS the Worker serves).   npm run catalog:css
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const css = await readFile(fileURLToPath(new URL('../catalog.css', import.meta.url)), 'utf8')
// Content hash → stylesheet URL version. Changes only when the CSS changes,
// so the <link href="/catalog.css?v=…"> busts caches on every real edit while
// letting the served file itself be cached immutably.
const ver = createHash('sha256').update(css).digest('hex').slice(0, 8)
const esc = css
  .replaceAll('\\', '\\\\')
  .replaceAll('`', '\\`')
  .replaceAll('${', '\\${')
await writeFile(
  fileURLToPath(new URL('./styles.mjs', import.meta.url)),
  '// Generated from catalog/catalog.css — edit that, then: npm run catalog:css\n' +
    "export const CSS_VER = '" + ver + "'\n" +
    'export const CSS = `' + esc + '`\n',
)
console.log('regenerated catalog/lib/styles.mjs (v=' + ver + ')')
