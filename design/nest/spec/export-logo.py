"""Rebuild portable logo outlines from the bundled IBM Plex Serif font.

Requires fonttools and brotli. The SVG symbol geometry stays unchanged.
"""
from pathlib import Path
import re
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

root = Path(__file__).resolve().parents[1]
font = TTFont(root / 'assets/fonts/ibm-plex-serif-600.woff2')
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = 132 / font['head'].unitsPerEm
for name, color in [('nest-lockup.svg', '#eef0e2'), ('nest-lockup-on-light.svg', '#0e150d')]:
    path = root / 'assets' / name
    editable = path.with_name(path.stem + '-editable.svg')
    svg = editable.read_text() if editable.exists() else path.read_text()
    if not editable.exists():
        editable.write_text(svg)
    x, paths = 250, []
    for character in 'Nest':
        glyph = glyphs[cmap[ord(character)]]
        pen = SVGPathPen(glyphs)
        glyph.draw(pen)
        paths.append(f'<path d="{pen.getCommands()}" transform="translate({x:.4f} 130) scale({scale:.6f} {-scale:.6f})"/>')
        x += glyph.width * scale - 4
    replacement = f'<g fill="{color}" aria-label="Nest">' + ''.join(paths) + '</g>'
    path.write_text(re.sub(r'<text\b[^>]*>Nest</text>', replacement, svg))
    print('Exported', name)
