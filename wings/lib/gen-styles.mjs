// Regenerate wings/lib/styles.mjs from wings/wings.css so the CSS keeps one
// source of truth but can still be imported by the Worker (which has no fs).
//   npm run wings:css
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const css = await readFile(fileURLToPath(new URL('../wings.css', import.meta.url)), 'utf8')
const esc = css
  .replaceAll('\\', '\\\\')
  .replaceAll('`', '\\`')
  .replaceAll('${', '\\${')

const out = `// Generated from wings/wings.css — edit that file, then run: npm run wings:css\nexport const CSS = \`${esc}\`\n`
await writeFile(fileURLToPath(new URL('./styles.mjs', import.meta.url)), out)
console.log('regenerated wings/lib/styles.mjs')
