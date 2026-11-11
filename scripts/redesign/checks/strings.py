# Extract every visitor-readable string from a page: <title>, meta/og/twitter text, JSON-LD text fields,
# visible text in document order (block by block), alt, aria-label, title attributes.
import sys, re, json, html
from html.parser import HTMLParser
src = open(sys.argv[1], encoding='utf-8').read()
out = []
out.append('## <title>\n' + html.unescape(re.search(r'<title>(.*?)</title>', src, re.S).group(1)))
for m in re.finditer(r'<meta (?:name|property)="([^"]+)" content="([^"]*)"', src):
    if any(k in m.group(1) for k in ('description', 'title', 'alt')):
        out.append(f'## meta {m.group(1)}\n' + html.unescape(m.group(2)))
for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', src, re.S):
    data = json.loads(m.group(1))
    def walk(o, path=''):
        if isinstance(o, dict):
            for k, v in o.items(): walk(v, path + '.' + k)
        elif isinstance(o, list):
            for i, v in enumerate(o): walk(v, path + f'[{i}]')
        elif isinstance(o, str) and path.split('.')[-1] in ('name', 'description', 'text') and not o.startswith('http'):
            out.append(f'## JSON-LD {path}\n{o}')
    walk(data)
BLOCK = {'p','h1','h2','h3','li','summary','blockquote','figcaption','a','button','span','small','div','label','option','th','caption','kbd','b','strong','em'}
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.skip = 0; s.buf = []; s.lines = []; s.attrs = []
    def flush(s):
        t = ' '.join(''.join(s.buf).split())
        if t: s.lines.append(t)
        s.buf = []
    def handle_starttag(s, tag, a):
        a = dict(a)
        if tag in ('script', 'style', 'head'): s.skip += 1
        for k in ('alt', 'aria-label', 'title'):
            if a.get(k): s.attrs.append(f'{tag}[{k}] = {a[k]}')
        if tag in ('p','h1','h2','h3','li','summary','blockquote','figcaption','button','option','th','caption','br','div','section','header','article','ul','ol'): s.flush()
        if tag in ('h1','h2','h3'): s.buf.append(f'[{tag.upper()}] ')
    def handle_endtag(s, tag):
        if tag in ('script', 'style', 'head'): s.skip -= 1
        if tag in ('p','h1','h2','h3','li','summary','blockquote','figcaption','button','option','th','caption','div','a'): s.flush()
    def handle_data(s, d):
        if not s.skip: s.buf.append(d)
p = P(); p.feed(src); p.flush()
out.append('## Visible text, in page order\n' + '\n'.join(p.lines))
out.append('## alt / aria-label / title attributes\n' + '\n'.join(p.attrs))
print('\n\n'.join(out))
