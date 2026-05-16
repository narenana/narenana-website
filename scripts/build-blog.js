// Markdown → static-HTML blog pipeline.
//
// Reads every `*.md` file in ../blog/, parses frontmatter + body, runs
// the body through marked (with shiki syntax highlighting), and emits:
//
//   site/blog/index.html                  — archive (reverse-chronological)
//   site/blog/<slug>/index.html           — per-post page
//   site/blog/tag/<tag>/index.html        — per-tag filtered archive
//   site/feed.xml                         — Atom feed (summary only)
//   site/sitemap.xml                      — regenerated with blog URLs
//
// Build is fully static — no runtime server involved. CF Workers Builds
// runs this script, then `wrangler deploy` ships the pre-rendered HTML.
// The Worker's env.ASSETS.fetch serves them directly from edge cache.
//
// Run:
//   npm run build:blog          # one-shot build (e.g. before push)
//
// Templates are inlined as template literals below to keep the whole
// pipeline in one auditable file. Styling reuses the site's CSS variables
// (--bg, --fg, --accent, etc.) defined in site/index.html, plus blog-
// specific rules inlined in each page's <style>.

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'
import { marked } from 'marked'
import { createHighlighter } from 'shiki'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const POSTS_DIR = path.join(ROOT, 'blog')
const OUT_DIR = path.join(ROOT, 'site')
const BLOG_OUT = path.join(OUT_DIR, 'blog')

const SITE_URL = 'https://www.narenana.com'
const SITE_NAME = 'narenana'
const AUTHOR = 'narenana'
const DESCRIPTION = 'Browser-native tools for RC pilots — flight log replay, telemetry visualisation. Open source.'

// ── Helpers ──────────────────────────────────────────────────────────────

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const fmtDate = iso => {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

const tagSlug = t => String(t).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')

// ── Read + parse all posts ───────────────────────────────────────────────

async function readPosts() {
  const files = await fs.readdir(POSTS_DIR)
  const mdFiles = files.filter(f => f.endsWith('.md'))
  const posts = []
  for (const f of mdFiles) {
    const raw = await fs.readFile(path.join(POSTS_DIR, f), 'utf-8')
    const { data, content } = matter(raw)
    if (data.draft) continue
    if (!data.title) throw new Error(`${f}: missing frontmatter.title`)
    if (!data.slug) throw new Error(`${f}: missing frontmatter.slug`)
    if (!data.date) throw new Error(`${f}: missing frontmatter.date`)
    posts.push({
      slug: data.slug,
      title: data.title,
      description: data.description || '',
      date: data.date,
      tags: Array.isArray(data.tags) ? data.tags : [],
      ogImage: data.og_image || `${SITE_URL}/assets/banner.jpg`,
      sourceFile: f,
      content,
    })
  }
  // Newest first
  posts.sort((a, b) => new Date(b.date) - new Date(a.date))
  return posts
}

// ── Markdown → HTML with syntax highlighting ─────────────────────────────

async function setupMarked() {
  const highlighter = await createHighlighter({
    themes: ['github-dark'],
    langs: ['javascript', 'typescript', 'json', 'bash', 'rust', 'html', 'css', 'jsx', 'tsx', 'sh', 'yaml', 'toml', 'markdown'],
  })
  // Marked's renderer expects strings back. shiki returns full <pre><code>
  // wrapped HTML, which is what we want.
  marked.use({
    renderer: {
      code({ text, lang }) {
        const language = (lang || '').trim().split(/\s/)[0]
        const valid = highlighter.getLoadedLanguages().includes(language)
        try {
          return highlighter.codeToHtml(text, {
            lang: valid ? language : 'text',
            theme: 'github-dark',
          })
        } catch {
          return `<pre><code>${esc(text)}</code></pre>`
        }
      },
      // Wrap headings with auto-id for anchor linking.
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens)
        const plain = tokens.map(t => t.raw || t.text || '').join('')
        const id = tagSlug(plain) || `h${depth}`
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a> ${text}</h${depth}>`
      },
    },
  })
  return highlighter
}

// ── Shared head fragment ─────────────────────────────────────────────────

const sharedHead = ({ title, description, canonical, ogImage, type = 'website' }) => `
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0e1117" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="author" content="${esc(AUTHOR)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${esc(canonical)}" />
    <link rel="icon" type="image/jpeg" href="/assets/avatar.jpg" />
    <link rel="apple-touch-icon" href="/assets/avatar.jpg" />
    <link rel="alternate" type="application/atom+xml" title="${esc(SITE_NAME)} blog" href="/feed.xml" />

    <meta property="og:type" content="${esc(type)}" />
    <meta property="og:site_name" content="${esc(SITE_NAME)}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${esc(ogImage)}" />
    <meta property="og:image:type" content="image/jpeg" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(ogImage)}" />`

// ── Shared CSS (inlined; matches site/index.html palette) ────────────────

const blogCss = `
      :root {
        --bg: #0e1117;
        --fg: #e6edf3;
        --muted: #8b949e;
        --accent: #1f9bd9;
        --accent-bright: #3eb5e8;
        --card: #161b22;
        --border: #30363d;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: var(--bg);
        color: var(--fg);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        line-height: 1.6;
      }
      a { color: var(--accent-bright); }
      a:hover { color: var(--fg); }
      .wrap {
        max-width: 760px;
        margin: 0 auto;
        padding: 32px 24px 64px;
      }
      .site-nav {
        margin-bottom: 32px;
        font-size: 0.95rem;
        color: var(--muted);
      }
      .site-nav a { color: var(--muted); text-decoration: none; }
      .site-nav a:hover { color: var(--accent-bright); }
      h1 {
        font-size: clamp(1.8rem, 4.5vw, 2.6rem);
        font-weight: 800;
        margin: 0 0 12px;
        letter-spacing: -0.02em;
        line-height: 1.15;
      }
      h2, h3, h4 { margin-top: 2em; }
      .post-meta {
        color: var(--muted);
        font-size: 0.95rem;
        margin: 0 0 32px;
      }
      .post-meta .tag {
        display: inline-block;
        padding: 2px 8px;
        margin-right: 6px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
        font-size: 0.8rem;
        color: var(--accent);
        text-decoration: none;
      }
      .post-meta .tag:hover { border-color: var(--accent); color: var(--accent-bright); }
      article p { margin: 0 0 1.2em; }
      article ul, article ol { margin: 0 0 1.2em; padding-left: 1.4em; }
      article li { margin-bottom: 0.4em; }
      article blockquote {
        margin: 1.2em 0;
        padding: 8px 16px;
        border-left: 3px solid var(--accent);
        background: var(--card);
        color: var(--muted);
      }
      article img { max-width: 100%; height: auto; border-radius: 8px; }
      article code {
        background: var(--card);
        border: 1px solid var(--border);
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 0.92em;
      }
      article pre {
        background: #161b22;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 14px 16px;
        overflow-x: auto;
        margin: 0 0 1.2em;
        font-size: 0.9em;
        line-height: 1.5;
      }
      article pre code {
        background: none;
        border: none;
        padding: 0;
        font-size: inherit;
      }
      article h2 a.anchor, article h3 a.anchor, article h4 a.anchor {
        color: var(--border);
        text-decoration: none;
        font-weight: 400;
        margin-right: 6px;
      }
      article h2:hover a.anchor, article h3:hover a.anchor { color: var(--accent); }
      .post-nav {
        margin-top: 48px;
        padding-top: 24px;
        border-top: 1px solid var(--border);
        display: flex;
        justify-content: space-between;
        gap: 16px;
        font-size: 0.95rem;
      }
      .post-nav a { color: var(--muted); text-decoration: none; max-width: 45%; }
      .post-nav a:hover { color: var(--accent-bright); }
      .post-nav .prev::before { content: "← "; }
      .post-nav .next::after { content: " →"; }
      .archive-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .archive-list li {
        padding: 16px 0;
        border-bottom: 1px solid var(--border);
      }
      .archive-list li:last-child { border-bottom: none; }
      .archive-list h2 {
        font-size: 1.3rem;
        margin: 0 0 4px;
      }
      .archive-list h2 a { color: var(--fg); text-decoration: none; }
      .archive-list h2 a:hover { color: var(--accent-bright); }
      .archive-list .archive-meta {
        color: var(--muted);
        font-size: 0.85rem;
        margin: 0 0 6px;
      }
      .archive-list .archive-desc {
        color: var(--muted);
        margin: 0;
      }
      footer.site-footer {
        margin-top: 64px;
        padding-top: 24px;
        border-top: 1px solid var(--border);
        color: var(--muted);
        font-size: 0.9rem;
      }
      footer.site-footer a { color: var(--muted); }`

const siteNav = `
      <nav class="site-nav" aria-label="Breadcrumb">
        <a href="/">narenana</a>
        / <a href="/blog/">blog</a>
      </nav>`

const siteFooter = `
      <footer class="site-footer">
        <p>
          More on <a href="/">narenana.com</a> ·
          Source on <a href="https://github.com/narenana">GitHub</a> ·
          <a href="/feed.xml">RSS</a>
        </p>
      </footer>`

// ── Per-post page ────────────────────────────────────────────────────────

function renderPost(post, allPosts) {
  const idx = allPosts.findIndex(p => p.slug === post.slug)
  const prev = allPosts[idx + 1] // older
  const next = allPosts[idx - 1] // newer
  const canonical = `${SITE_URL}/blog/${post.slug}/`

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    'headline': post.title,
    'description': post.description,
    'datePublished': new Date(post.date).toISOString(),
    'image': post.ogImage,
    'url': canonical,
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonical },
    'author': { '@type': 'Organization', 'name': AUTHOR, 'url': SITE_URL + '/' },
    'publisher': { '@type': 'Organization', 'name': SITE_NAME, 'logo': { '@type': 'ImageObject', 'url': `${SITE_URL}/assets/avatar.jpg` } },
    'isPartOf': { '@type': 'Blog', 'url': `${SITE_URL}/blog/`, 'name': `${SITE_NAME} blog` },
    'keywords': post.tags.join(', '),
  }

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', position: 1, name: 'narenana', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE_URL + '/blog/' },
      { '@type': 'ListItem', position: 3, name: post.title, item: canonical },
    ],
  }

  const tagLinks = post.tags.map(t =>
    `<a class="tag" href="/blog/tag/${esc(tagSlug(t))}/">${esc(t)}</a>`
  ).join(' ')

  return `<!doctype html>
<html lang="en">
  <head>
${sharedHead({ title: `${post.title} · ${SITE_NAME}`, description: post.description, canonical, ogImage: post.ogImage, type: 'article' })}
    <meta property="article:published_time" content="${esc(new Date(post.date).toISOString())}" />
    ${post.tags.map(t => `<meta property="article:tag" content="${esc(t)}" />`).join('\n    ')}

    <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
    <script type="application/ld+json">${JSON.stringify(breadcrumbs)}</script>

    <style>${blogCss}</style>
  </head>
  <body>
    <main class="wrap">
${siteNav}

      <article>
        <h1>${esc(post.title)}</h1>
        <p class="post-meta">
          <time datetime="${esc(new Date(post.date).toISOString())}">${esc(fmtDate(post.date))}</time>
          ${tagLinks ? ' · ' + tagLinks : ''}
        </p>

        ${marked.parse(post.content)}
      </article>

      <nav class="post-nav" aria-label="Post navigation">
        ${prev ? `<a class="prev" href="/blog/${esc(prev.slug)}/">${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="next" href="/blog/${esc(next.slug)}/">${esc(next.title)}</a>` : '<span></span>'}
      </nav>

${siteFooter}
    </main>
  </body>
</html>
`
}

// ── Archive page (/blog/) ────────────────────────────────────────────────

function renderArchive(posts) {
  const canonical = `${SITE_URL}/blog/`
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    'url': canonical,
    'name': `${SITE_NAME} blog`,
    'description': DESCRIPTION,
    'publisher': { '@type': 'Organization', 'name': SITE_NAME, 'url': SITE_URL + '/' },
    'blogPost': posts.map(p => ({
      '@type': 'BlogPosting',
      'headline': p.title,
      'url': `${SITE_URL}/blog/${p.slug}/`,
      'datePublished': new Date(p.date).toISOString(),
      'description': p.description,
    })),
  }

  const items = posts.map(p => {
    const tagLinks = p.tags.map(t =>
      `<a class="tag" href="/blog/tag/${esc(tagSlug(t))}/">${esc(t)}</a>`
    ).join(' ')
    return `
        <li>
          <p class="archive-meta">
            <time datetime="${esc(new Date(p.date).toISOString())}">${esc(fmtDate(p.date))}</time>
            ${tagLinks ? ' · ' + tagLinks : ''}
          </p>
          <h2><a href="/blog/${esc(p.slug)}/">${esc(p.title)}</a></h2>
          <p class="archive-desc">${esc(p.description)}</p>
        </li>`
  }).join('')

  return `<!doctype html>
<html lang="en">
  <head>
${sharedHead({ title: `Blog · ${SITE_NAME}`, description: 'Notes on building browser-native tools for RC pilots.', canonical, ogImage: `${SITE_URL}/assets/banner.jpg` })}

    <script type="application/ld+json">${JSON.stringify(jsonld)}</script>

    <style>${blogCss}</style>
  </head>
  <body>
    <main class="wrap">
${siteNav}

      <h1>Blog</h1>
      <p class="post-meta">Notes on building browser-native tools for RC pilots.</p>

      <ul class="archive-list">${items}
      </ul>

${siteFooter}
    </main>
  </body>
</html>
`
}

// ── Tag archive (/blog/tag/<tag>/) ───────────────────────────────────────

function renderTagPage(tag, posts) {
  const tagSlugged = tagSlug(tag)
  const canonical = `${SITE_URL}/blog/tag/${tagSlugged}/`

  const items = posts.map(p => `
        <li>
          <p class="archive-meta">
            <time datetime="${esc(new Date(p.date).toISOString())}">${esc(fmtDate(p.date))}</time>
          </p>
          <h2><a href="/blog/${esc(p.slug)}/">${esc(p.title)}</a></h2>
          <p class="archive-desc">${esc(p.description)}</p>
        </li>`).join('')

  return `<!doctype html>
<html lang="en">
  <head>
${sharedHead({ title: `Tag: ${tag} · ${SITE_NAME} blog`, description: `Posts tagged ${tag}.`, canonical, ogImage: `${SITE_URL}/assets/banner.jpg` })}

    <style>${blogCss}</style>
  </head>
  <body>
    <main class="wrap">
      <nav class="site-nav" aria-label="Breadcrumb">
        <a href="/">narenana</a>
        / <a href="/blog/">blog</a>
        / tag: ${esc(tag)}
      </nav>

      <h1>Tag: ${esc(tag)}</h1>
      <p class="post-meta">${posts.length} post${posts.length === 1 ? '' : 's'} tagged <code>${esc(tag)}</code>.</p>

      <ul class="archive-list">${items}
      </ul>

${siteFooter}
    </main>
  </body>
</html>
`
}

// ── Atom feed (/feed.xml) — summary only ─────────────────────────────────

function renderFeed(posts) {
  const updated = posts[0] ? new Date(posts[0].date).toISOString() : new Date().toISOString()
  const entries = posts.slice(0, 20).map(p => {
    const url = `${SITE_URL}/blog/${p.slug}/`
    return `
  <entry>
    <title>${esc(p.title)}</title>
    <link href="${esc(url)}"/>
    <id>${esc(url)}</id>
    <updated>${esc(new Date(p.date).toISOString())}</updated>
    <published>${esc(new Date(p.date).toISOString())}</published>
    <summary>${esc(p.description)} Read more at ${esc(url)}</summary>
    <author><name>${esc(AUTHOR)}</name></author>
${p.tags.map(t => `    <category term="${esc(t)}"/>`).join('\n')}
  </entry>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(SITE_NAME)} blog</title>
  <link href="${SITE_URL}/feed.xml" rel="self"/>
  <link href="${SITE_URL}/blog/"/>
  <id>${SITE_URL}/blog/</id>
  <updated>${updated}</updated>
  <author><name>${esc(AUTHOR)}</name></author>
  <subtitle>${esc(DESCRIPTION)}</subtitle>
${entries}
</feed>
`
}

// ── Sitemap (regenerated) ────────────────────────────────────────────────

function renderSitemap(posts, tagsToPosts) {
  // Static core URLs first (matches what was hand-maintained in Phase 1).
  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${SITE_URL}/log-viewer/`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/blog/`, priority: '0.7', changefreq: 'weekly' },
  ]
  for (const p of posts) {
    urls.push({
      loc: `${SITE_URL}/blog/${p.slug}/`,
      priority: '0.6',
      lastmod: new Date(p.date).toISOString().slice(0, 10),
    })
  }
  for (const [tag] of tagsToPosts) {
    urls.push({
      loc: `${SITE_URL}/blog/tag/${tagSlug(tag)}/`,
      priority: '0.4',
      changefreq: 'monthly',
    })
  }

  const items = urls.map(u => `  <url>
    <loc>${esc(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${esc(u.lastmod)}</lastmod>` : ''}${u.changefreq ? `\n    <changefreq>${esc(u.changefreq)}</changefreq>` : ''}
    <priority>${esc(u.priority)}</priority>
  </url>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Generated by scripts/build-blog.js. Do not edit by hand —
  any changes will be overwritten on next build.
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>
`
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now()
  console.log('Building blog...')

  await setupMarked()
  const posts = await readPosts()

  // Per-post pages
  for (const p of posts) {
    const html = renderPost(p, posts)
    const outPath = path.join(BLOG_OUT, p.slug, 'index.html')
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    await fs.writeFile(outPath, html)
  }

  // Archive
  await fs.mkdir(BLOG_OUT, { recursive: true })
  await fs.writeFile(path.join(BLOG_OUT, 'index.html'), renderArchive(posts))

  // Tag pages
  const tagsToPosts = new Map()
  for (const p of posts) {
    for (const t of p.tags) {
      if (!tagsToPosts.has(t)) tagsToPosts.set(t, [])
      tagsToPosts.get(t).push(p)
    }
  }
  for (const [tag, taggedPosts] of tagsToPosts) {
    const outPath = path.join(BLOG_OUT, 'tag', tagSlug(tag), 'index.html')
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    await fs.writeFile(outPath, renderTagPage(tag, taggedPosts))
  }

  // Feed
  await fs.writeFile(path.join(OUT_DIR, 'feed.xml'), renderFeed(posts))

  // Sitemap
  await fs.writeFile(path.join(OUT_DIR, 'sitemap.xml'), renderSitemap(posts, tagsToPosts))

  const elapsed = Date.now() - t0
  console.log(`  ${posts.length} post${posts.length === 1 ? '' : 's'}, ${tagsToPosts.size} tag${tagsToPosts.size === 1 ? '' : 's'} — built in ${elapsed} ms`)
}

main().catch(err => {
  console.error('build-blog failed:', err)
  process.exit(1)
})
