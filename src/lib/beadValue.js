// A bead Map's value is normally just a colour hex string. Cross stitch is
// the default and stays encoded as plain colour (so every pre-existing save
// round-trips with zero migration); the single-line stitch adds a trailing
// "|L" marker, and its vertically-flipped mirror (the other diagonal) adds
// "|F". This lets all three stitch shapes mix bead-by-bead within one
// design, same as colour does — encode on write, decode on any read that
// needs the real CSS colour or the shape to draw.
const MARKERS = { line: '|L', lineFlip: '|F' }

export function encodeBead(color, style) {
  const m = MARKERS[style]
  return m ? `${color}${m}` : color
}

export function decodeBead(value) {
  if (typeof value === 'string') {
    for (const [style, m] of Object.entries(MARKERS)) {
      if (value.endsWith(m)) return { color: value.slice(0, -m.length), style }
    }
  }
  return { color: value, style: 'cross' }
}
