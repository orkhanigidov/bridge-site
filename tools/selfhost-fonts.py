"""One-off helper: download the Google Fonts used by the site into assets/fonts/
and emit assets/css/fonts.css with local urls (latin + latin-ext subsets only).

Run from the repo root:  python tools/selfhost-fonts.py <downloaded-css>
The CSS must be fetched with a woff2-capable user agent:
  curl -A 'Mozilla/5.0 ... Chrome/126' 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap'
"""
import pathlib
import re
import sys
import urllib.request

css_path = pathlib.Path(sys.argv[1])
fonts_dir = pathlib.Path('assets/fonts')
out_css = pathlib.Path('assets/css/fonts.css')
KEEP_SUBSETS = {'latin', 'latin-ext'}

block_re = re.compile(r'/\* ([a-z-]+) \*/\s*(@font-face\s*\{[^}]*\})', re.S)
url_re = re.compile(r'url\((https://[^)]+\.woff2)\)')
family_re = re.compile(r"font-family:\s*'([^']+)'")
weight_re = re.compile(r'font-weight:\s*(\d+)')

fonts_dir.mkdir(parents=True, exist_ok=True)

out_parts = [
    '/* Self-hosted fonts (latin + latin-ext). Source: Google Fonts,\n'
    '   Space Grotesk (400/500/600/700) and IBM Plex Mono (400/500).\n'
    '   Regenerate with tools/selfhost-fonts.py. */',
]

for subset, block in block_re.findall(css_path.read_text(encoding='utf-8')):
    if subset not in KEEP_SUBSETS:
        continue
    remote = url_re.search(block).group(1)
    family = family_re.search(block).group(1)
    weight = weight_re.search(block).group(1)
    slug = family.lower().replace(' ', '-')
    filename = f'{slug}-{weight}-{subset}.woff2'
    target = fonts_dir / filename
    if not target.exists():
        request = urllib.request.Request(remote, headers={'User-Agent': 'Mozilla/5.0'})
        target.write_bytes(urllib.request.urlopen(request, timeout=30).read())
    out_parts.append(block.replace(remote, f'../fonts/{filename}').strip())
    print(f'{filename}  <-  {remote}')

out_css.write_text('\n\n'.join(out_parts) + '\n', encoding='utf-8')
print(f'wrote {out_css} with {len(out_parts) - 1} @font-face rules')
