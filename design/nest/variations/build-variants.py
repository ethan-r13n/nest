"""Build Nest logo exploration board and portable lockups from native SVGs."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

root = Path(__file__).resolve().parent
brand = root.parent
source = (brand / 'assets/nest-symbol.svg').read_text()
circle = '<circle cx="120" cy="66" r="23"/>'

ivory = '''<circle cx="120" cy="66" r="23" fill="#eef0e2"/><g clip-path="url(#ivory-clip)" fill="#ff5500"><path d="M97 70L141 45L145 52L101 77Z"/><path d="M99 82L143 57L147 64L103 89Z"/></g>'''
defs = '<defs><clipPath id="ivory-clip"><circle cx="120" cy="66" r="19"/></clipPath></defs>'
svg = source.replace('<g fill="#ff5500">', defs + '<g fill="#ff5500">').replace(circle, ivory)
svg = re.sub(r'<title[^>]*>.*?</title>', '<title id="title">Nest — Ivory core</title><desc>A cream circular egg with internal orange diagonal bands, cradled by the original orange weave.</desc>', svg)
(root / 'ivory-core.svg').write_text(svg)

single = '''<defs><mask id="single-mask" maskUnits="userSpaceOnUse" x="95" y="41" width="50" height="50"><circle cx="120" cy="66" r="23" fill="white"/><path d="M97 79L143 53" stroke="black" stroke-width="6.5"/></mask></defs><circle cx="120" cy="66" r="23" mask="url(#single-mask)"/>'''
svg = source.replace(circle, single)
svg = re.sub(r'<title[^>]*>.*?</title>', '<title id="title">Nest — Single cut</title><desc>A solid round egg with one bold rising diagonal cut, held by the original weave.</desc>', svg)
(root / 'single-cut.svg').write_text(svg)

variants = [
    ('A', 'Twin cut', 'circular-cut', 'Original weave / inset twin cuts'),
    ('B', 'Stellar ring', 'circular-orbit', 'Original weave / circular ring core'),
    ('C', 'Compact weave', 'compact-stellar', 'Simplified weave / split round core'),
    ('D', 'Soft cradle', 'rounded-cradle', 'Rounded bowl / diagonal halo core'),
    ('E', 'Ivory core', 'ivory-core', 'Cream egg / orange diagonal bands'),
    ('F', 'Single cut', 'single-cut', 'Original weave / one bold cut'),
]

fonts = {}
for key, filename in [('serif','ibm-plex-serif-600.woff2'),('sans','ibm-plex-sans-400.woff2'),('mono','ibm-plex-mono-500.woff2')]:
    font = TTFont(brand / 'assets/fonts' / filename)
    fonts[key] = (font, font.getGlyphSet(), font.getBestCmap())

def text_path(text, x, baseline, size, font='sans', color='#eef0e2', tracking=0):
    f, glyphs, cmap = fonts[font]
    scale = size / f['head'].unitsPerEm
    items = []
    for char in text:
        name = cmap.get(ord(char), cmap.get(32))
        glyph = glyphs[name]
        pen = SVGPathPen(glyphs)
        glyph.draw(pen)
        d = pen.getCommands()
        if d:
            items.append(f'<path d="{d}" transform="translate({x:.3f} {baseline}) scale({scale:.6f} {-scale:.6f})"/>')
        x += glyph.width * scale + tracking
    return '<g fill="' + color + '">' + ''.join(items) + '</g>'

def nested_svg(file, x, y, width, height, prefix):
    raw = (root / file).read_text()
    raw = re.sub(r'<\?xml[^>]*>', '', raw)
    for name in re.findall(r'\bid="([^"]+)"', raw):
        raw = raw.replace(f'id="{name}"', f'id="{prefix}-{name}"').replace(f'url(#{name})', f'url(#{prefix}-{name})').replace(f'aria-labelledby="{name}"', f'aria-labelledby="{prefix}-{name}"')
    raw = raw.replace('<svg ', f'<svg x="{x}" y="{y}" width="{width}" height="{height}" ', 1)
    return raw

board = ['<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1210" viewBox="0 0 1800 1210" role="img"><title>Nest — six circular Stellar-inspired logo variations</title><desc>A Twin cut, B Stellar ring, C Compact weave, D Soft cradle, E Ivory core, F Single cut. All retain a circular egg and Nest orange palette.</desc><rect width="1800" height="1210" fill="#0e150d"/>']
board.append(text_path('NEST / LOGO EXPLORATIONS', 60, 58, 16, 'mono', '#ff5500', 1.8))
board.append(text_path('A circular core. A familiar signal.', 60, 125, 48, 'serif'))
board.append(text_path('Six directions with a round egg and a Stellar-inspired diagonal motif.', 62, 164, 19, 'sans', '#9aa890'))

lockup_master = (brand / 'assets/nest-lockup.svg').read_text()
wordmark = re.search(r'(<g fill="#eef0e2" aria-label="Nest">.*?</g>)', lockup_master).group(1)

for index, (letter, name, file, caption) in enumerate(variants):
    x = 60 + (index % 3) * 570
    y = 205 + (index // 3) * 470
    board.append(f'<rect x="{x}" y="{y}" width="540" height="440" rx="18" fill="#151f14" stroke="#eef0e2" stroke-opacity=".14"/>')
    board.append(text_path(letter, x+24, y+42, 17, 'mono', '#ff5500'))
    board.append(text_path(name, x+60, y+42, 21, 'sans'))
    board.append(nested_svg(file+'.svg', x+105, y+78, 330, 226, letter))
    board.append(text_path('Nest', x+210, y+366, 58, 'serif', tracking=-1.5))
    board.append(text_path(caption, x+24, y+411, 14, 'mono', '#9aa890'))
    raw = (root / (file+'.svg')).read_text()
    nested = re.sub(r'<svg\b[^>]*>', '<svg x="10" y="16" width="211.2" height="144.32" viewBox="0 0 240 164">', raw, count=1)
    lockup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" role="img"><title>Nest — '+name+' lockup</title>'+nested+wordmark+'</svg>'
    (root / (file+'-lockup.svg')).write_text(lockup)
board.append(text_path('NEST / CIRCULAR CORE STUDIES',60,1173,13,'mono','#829179',1.1))
board.append(text_path('VECTOR VARIATIONS / 25 OCT 2026',1320,1173,13,'mono','#829179'))
board.append('</svg>')
(root / 'nest-logo-variations.svg').write_text(''.join(board))
for p in root.glob('*.svg'):
    ET.parse(p)
print('Built six variations, six outlined lockups, and comparison board.')
