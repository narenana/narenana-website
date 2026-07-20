// Regenerate catalog/lib/styles.mjs from catalog/catalog.css (single source of
// truth for CSS the Worker serves).   npm run catalog:css
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const css = await readFile(fileURLToPath(new URL('../catalog.css', import.meta.url)), 'utf8')
const esc = css
  .replaceAll('\\', '\\\\')
  .replaceAll('`', '\\`')
  .replaceAll('${', '\\${')
await writeFile(
  fileURLToPath(new URL('./styles.mjs', import.meta.url)),
  '// Generated from catalog/catalog.css — edit that, then: npm run catalog:css\nexport const CSS = `' + esc + '`\n',
)
console.log('regenerated catalog/lib/styles.mjs')
