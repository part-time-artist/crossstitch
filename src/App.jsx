import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { getTechnique, DEFAULT_TECHNIQUE, TECHNIQUES } from './techniques'
import { renderFullChart, renderLegend, rasterScale } from './lib/chart'
import {
  listArtworks,
  getArtwork,
  putArtwork,
  deleteArtwork as dbDeleteArtwork,
  getMeta,
  setMeta,
} from './lib/store'
import {
  IconDraw, IconErase, IconSelect, IconLayers,
  IconEye, IconEyeOff, IconLock, IconUnlock,
} from './icons'
import { encodeBead, decodeBead } from './lib/beadValue'

// ---- design tokens: charcoal "reown"-style chrome (see cross stitch references/
// ui reference.png). Dark rounded panels, monospace UPPERCASE labels, one blue
// accent for the primary action. Artboard stays light so thread colours stay
// honest (the designer judges cross-stitch colours against near-white fabric).
const T = {
  bg: '#1b1b1d', // charcoal backdrop + sidebar
  panel: '#1b1b1d', // sidebar
  panelSolid: '#262629', // section blocks / cards
  ink: '#f4f4f2', // primary text
  inkSoft: '#8b8b87', // muted labels
  line: '#36363c', // hairlines / dotted grid
  active: '#f4f4f2', // active = light fill, dark text
  activeInk: '#1b1b1d',
  accent: '#3d6efb', // reference blue — primary action + active rings
  pill: '#2c2c31', // input / control background
  artboard: '#f3f3f0', // the canvas (light, for honest colour)
  radius: 12,
  mono: "'SFMono-Regular', ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace",
}

const STORAGE_KEY = 'beadwork3_palettes_v1'
const DESIGN_KEY = 'beadwork3_design_v1'
const DESIGNS_KEY = 'beadwork3_designs_v1' // named design slots

// Default preset: the user's own 5 colours (2026-06-11) — soft pink,
// chartreuse, sky blue, bone, deep violet. (Bead colours may be rich; only
// the UI chrome must stay muted, spec §7.5.)
const DEFAULT_PALETTE = ['#F3CEDE', '#D8DA5F', '#8BBEDD', '#F4EEDF', '#4A3772']

const key = (c, r) => `${c},${r}`

// Cross-stitch cell sizes (square, w === h). One cell = one cross = the stated
// real-world size. Default 3 mm per the user's reference (one cross fits a 3 mm
// cell). With PACK_X = PACK_Y = 1, the cell pitch equals the cell size, so cells
// tile edge-to-edge like aida fabric.
const BEAD_SIZES = [
  { label: '2 mm', w: 2, h: 2 },
  { label: '3 mm', w: 3, h: 3 },
  { label: '4 mm', w: 4, h: 4 },
]

const HISTORY_MAX = 50 // undo steps (one stroke / fill / selection op = one step)

// New artworks auto-name from the forest (Morii = forest). Pick the next unused
// name; once the list is exhausted, append a number ("Oak 2"…). Rename anytime.
const TREE_NAMES = [
  'Oak', 'Willow', 'Cedar', 'Birch', 'Rowan', 'Alder', 'Hazel', 'Aspen', 'Maple',
  'Elm', 'Pine', 'Holly', 'Hawthorn', 'Juniper', 'Linden', 'Spruce', 'Larch',
  'Beech', 'Ash', 'Yew', 'Fern', 'Moss', 'Ivy', 'Bramble', 'Thicket', 'Glade',
]
function nextTreeName(usedNames) {
  const used = new Set(usedNames)
  for (const t of TREE_NAMES) if (!used.has(t)) return t
  for (let n = 2; ; n++) for (const t of TREE_NAMES) if (!used.has(`${t} ${n}`)) return `${t} ${n}`
}

// The view transform is: screen = scale · R(rot) · doc + (tx,ty), where R is a
// rotation. These invert/apply it so every screen↔document conversion (drawing,
// hit-test, pinch, zoom) stays correct once the canvas can be rotated.
function screenToDoc(sx, sy, v) {
  const dx = sx - v.tx
  const dy = sy - v.ty
  const c = Math.cos(v.rot || 0)
  const s = Math.sin(v.rot || 0)
  return { x: (c * dx + s * dy) / v.scale, y: (-s * dx + c * dy) / v.scale }
}

// short "last edited" label for the gallery
function timeAgo(ts) {
  if (!ts) return '—'
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`
  return new Date(ts).toLocaleDateString()
}

// Fully "packed" view: filled beads are DRAWN this much larger than their true
// size, so neighbouring beads press together the way real woven beads do and a
// motif reads as continuous fabric instead of scattered dots. The spacing slider
// blends from true size (0) up to this (1); beads just kiss at ~1.15, i.e. 0.75
// on the slider (the default). Pure rendering — bead centres, hit-testing,
// counts and the printed chart are untouched.
const PACKED_DRAW = 1.2

export default function Home() {
  // ---- technique ----
  // One artwork = one technique, FIXED for that artwork (no mid-artwork
  // switching — changing technique starts a new artwork). The technique supplies
  // the grid (the only thing that differs); everything else is shared. Chosen
  // saved designs carry the technique. Only one technique exists (cross-stitch),
  // so there's no chooser — "New artwork" creates one directly.
  const [techniqueId, setTechniqueId] = useState(DEFAULT_TECHNIQUE)
  const tech = useMemo(() => getTechnique(techniqueId), [techniqueId])

  // ---- physical model ----
  // Two fixed bead sizes, both 4:5 ratio (width:height). Stated size = bead width.
  const [beadMM, setBeadMM] = useState({ w: 3, h: 3 }) // 3 mm square cell default (one cross = 3 mm)
  const [canvasCm, setCanvasCm] = useState({ w: 10, h: 7 }) // physical canvas (cm)

  // derived bead/row counts from the physical sizes (same packing as screen)
  const { cols, rows } = useMemo(
    () =>
      tech.beadCountFromCm({
        canvasWcm: canvasCm.w,
        canvasHcm: canvasCm.h,
        beadWmm: beadMM.w,
        beadHmm: beadMM.h,
      }),
    [canvasCm, beadMM, tech]
  )

  // ---- rendering size ----
  // Bead px is tied to PHYSICAL mm (× SCREEN_PXMM), so the artboard size tracks the
  // cm canvas, NOT the bead count. Changing bead size then changes density (how many
  // beads fit), while the canvas stays the size set in cm. Zoom/pan is a view
  // transform, so the canvas element always matches the viewport (no 16k-px limit).
  const SCREEN_PXMM = 8 // screen px per physical mm
  const Bw = beadMM.w * SCREEN_PXMM
  const Bh = beadMM.h * SCREEN_PXMM

  const geo = useMemo(
    () => tech.makeGeometry({ Bw, Bh, cols, rows }),
    [Bw, Bh, cols, rows, tech]
  )

  // view transform: screen px = scale · R(rot) · doc + t.  rot (radians) lets the
  // canvas be rotated with a two-finger twist. viewport = pasteboard size.
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0, rot: 0 })
  const [viewport, setViewport] = useState({ w: 1, h: 1 })

  // ---- design data ----
  // The design is a STACK of layers (array order = bottom→top; index 0 is the
  // bottom). Each layer is its own bead Map. `beads`/`beadsRef` mirror the
  // ACTIVE layer, so every existing edit path (strokes, fill, selection,
  // pattern, duplicate) keeps operating on a single Map; writes are synced back
  // into the active layer entry. Where two visible layers fill the same node
  // the TOP one wins (a woven bead is one solid colour — no blending).
  const uid = () => Math.random().toString(36).slice(2, 9)
  const makeLayer = (name, beadMap = new Map()) => ({
    id: uid(), name, visible: true, locked: false, beads: beadMap,
  })
  const firstLayerRef = useRef(null)
  if (!firstLayerRef.current) firstLayerRef.current = makeLayer('Layer 1')
  const [layers, setLayers] = useState(() => [firstLayerRef.current])
  // Procreate-style folders in the layers panel: {id,name,visible,locked,collapsed}.
  // Member layers carry a matching `groupId` and MUST stay contiguous in
  // z-order (every group op below preserves that; there's no drag-reorder in
  // this app yet, so ↑/↓ move is simply disabled on grouped layers rather
  // than risk splitting a group).
  const [groups, setGroups] = useState([])
  const [activeId, setActiveId] = useState(() => firstLayerRef.current.id)
  const [beads, setBeads] = useState(() => firstLayerRef.current.beads)
  const [showLayers, setShowLayers] = useState(false)
  const [tool, setTool] = useState('draw') // draw | erase | select
  const [color, setColor] = useState('#F3CEDE') // starts on the palette's pink
  const [stitchStyle, setStitchStyle] = useState('cross') // 'cross' | 'line' — the brush's active stitch shape
  const [pack, setPack] = useState(0.75) // 0 = spaced (true size) … 1 = max packed; 0.75 ≈ touching
  const [brush, setBrush] = useState(1) // brush radius in beads
  const [recentColors, setRecentColors] = useState([]) // up to 5 recently used
  const [selection, setSelection] = useState(() => new Set()) // selected bead keys
  const [marquee, setMarquee] = useState(null) // live select rectangle (doc coords)

  const pushRecent = useCallback((c) => {
    setRecentColors((prev) => [c, ...prev.filter((x) => x !== c)].slice(0, 5))
  }, [])

  // ---- undo / redo ----
  // History stores whole bead Maps (they're replaced immutably, so pushing the
  // old reference is free). Strokes snapshot once at pointer-down (endDrag
  // commits it only if the stroke changed something); one-shot edits (fill,
  // selection ops, clear) go through `commit`, which snapshots only on change.
  const beadsRef = useRef(beads)
  // Live mirrors of the layer stack + active id, updated SYNCHRONOUSLY by the
  // layer writers below (React state lags behind fast pencil events). beadsRef
  // is always the active layer's Map; layersRef is the whole stack.
  const layersRef = useRef(null)
  if (!layersRef.current) layersRef.current = layers
  const groupsRef = useRef(null)
  if (!groupsRef.current) groupsRef.current = groups
  const activeIdRef = useRef(activeId)
  // the active layer can be edited only when it is visible and unlocked; the
  // ref lets pointer handlers (closures) read the latest value
  const canEditRef = useRef(true)
  const undoStack = useRef([])
  const redoStack = useRef([])
  const strokeBase = useRef(null) // beads Map at stroke start
  const strokeWorking = useRef(null) // private mutable clone for the CURRENT stroke (freehand path)
  const patternBaseRef = useRef(null) // beads before the last pattern apply (see makePattern)

  // Repaint the canvas straight from beadsRef on the next animation frame —
  // no React render. Pencil strokes go through this: re-rendering the whole
  // component tree per pointer event (120–240Hz) churned enough memory to get
  // the tab killed on iPad Safari.
  const rafRef = useRef(0)
  const drawRef = useRef(null) // latest drawScene (assigned every render below)
  // Zoom/pan performance: while a gesture is live, skip the full per-cell
  // redraw (expensive with the jat bezier stitch) and blit the last full
  // render instead — see drawBlit/updateSceneCache below, assigned to refs
  // every render so this stable callback always calls the latest closure.
  const sceneCacheRef = useRef(null) // offscreen canvas holding the last full render
  const cacheViewRef = useRef(null) // the view {scale,tx,ty,rot} it was drawn at
  const interactingRef = useRef(false) // true while a pan/zoom/pinch gesture is live
  const interactTimerRef = useRef(0)
  const drawBlitRef = useRef(null) // latest drawBlit (assigned every render below)
  const updateSceneCacheRef = useRef(null) // latest updateSceneCache (assigned every render below)
  const requestRedraw = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (interactingRef.current && sceneCacheRef.current && drawBlitRef.current) {
        drawBlitRef.current(ctx)
      } else if (drawRef.current) {
        drawRef.current(ctx)
        if (updateSceneCacheRef.current) updateSceneCacheRef.current(canvas)
      }
    })
  }, [])
  // Marks a gesture as "live" so requestRedraw takes the fast blit path; after
  // ~130ms of no calls it flips back and forces one crisp full render (which
  // also refreshes the cache). Area revealed mid-gesture beyond the old cached
  // viewport is blank until that settle — invisible for a normal quick gesture.
  const beginInteract = useCallback(() => {
    interactingRef.current = true
    clearTimeout(interactTimerRef.current)
    interactTimerRef.current = setTimeout(() => {
      interactingRef.current = false
      requestRedraw()
    }, 130)
  }, [requestRedraw])

  // SINGLE write path for the design Map. beadsRef is advanced SYNCHRONOUSLY,
  // never via an effect: React renders lag behind fast pencil events, so a new
  // stroke reading render-time state could start from a stale Map and wipe the
  // previous stroke. Everything that changes beads must go through applyBeads.
  // silent = repaint only (strokes); endDrag syncs React state once per stroke.
  // Write the active layer's new bead Map into the live stack too. Deferred for
  // silent strokes (rebuilding the array 240×/s would defeat the rAF path) —
  // endDrag calls syncActiveLayer once at stroke end to commit it to React.
  const writeActiveLayer = (map) => {
    const nl = layersRef.current.map((l) =>
      l.id === activeIdRef.current ? { ...l, beads: map } : l
    )
    layersRef.current = nl
    return nl
  }
  const syncActiveLayer = () => setLayers(writeActiveLayer(beadsRef.current))

  const applyBeads = useCallback((next, silent = false) => {
    if (typeof next === 'function') next = next(beadsRef.current)
    if (next === beadsRef.current) return
    beadsRef.current = next
    patternBaseRef.current = null // any normal edit ends pattern layout-swapping
    if (silent) requestRedraw()
    else {
      setBeads(next)
      setLayers(writeActiveLayer(next))
    }
  }, [requestRedraw])

  // A history entry is a whole-document snapshot { layers, activeId }. Layer
  // bead Maps are immutable (replaced on change), so a snapshot just shares the
  // unchanged Map references — cheap, like the single-Map snapshots before.
  // currentDoc reads the LIVE refs (never stale React state).
  const currentDoc = () => ({ layers: layersRef.current, activeId: activeIdRef.current, groups: groupsRef.current })
  const docBeads = (doc) => {
    let t = 0
    for (const l of doc.layers) t += l.beads.size
    return t
  }

  // Restore a document snapshot into both the live refs and React state.
  const applyDoc = (doc) => {
    layersRef.current = doc.layers
    groupsRef.current = doc.groups || []
    const active = doc.layers.find((l) => l.id === doc.activeId) || doc.layers[0]
    activeIdRef.current = active ? active.id : null
    beadsRef.current = active ? active.beads : new Map()
    patternBaseRef.current = null
    setLayers(doc.layers)
    setGroups(groupsRef.current)
    setActiveId(activeIdRef.current)
    setBeads(beadsRef.current)
    setSelection(new Set())
    setPlacing(null)
  }

  // History is capped by TOTAL stored beads (across all layers) as well as
  // steps: 50 snapshots of a dense full-canvas design is hundreds of MB —
  // enough for iPad Safari to kill the tab. At least one step always stays.
  const HISTORY_BEAD_BUDGET = 250000
  const pushHistory = (prevDoc) => {
    const st = undoStack.current
    st.push(prevDoc)
    redoStack.current = []
    let total = 0
    for (const d of st) total += docBeads(d)
    while (st.length > HISTORY_MAX || (st.length > 1 && total > HISTORY_BEAD_BUDGET)) {
      total -= docBeads(st[0])
      st.shift()
    }
  }

  const commit = useCallback((updater) => {
    const prev = beadsRef.current
    const next = updater(prev)
    if (next === prev) return
    pushHistory(currentDoc())
    applyBeads(next)
  }, [applyBeads])

  const undo = useCallback(() => {
    if (!undoStack.current.length) return
    redoStack.current.push(currentDoc())
    applyDoc(undoStack.current.pop())
  }, [])
  const redo = useCallback(() => {
    if (!redoStack.current.length) return
    undoStack.current.push(currentDoc())
    applyDoc(redoStack.current.pop())
  }, [])

  // ---- layer operations ----------------------------------------------------
  // Content changes (add/delete/duplicate/merge/reorder) are one undo step
  // each; metadata toggles (visibility/lock/rename/switch-active) are not.
  const switchLayer = (id) => {
    const l = layersRef.current.find((x) => x.id === id)
    if (!l || id === activeIdRef.current) return
    activeIdRef.current = id
    beadsRef.current = l.beads
    setActiveId(id)
    setBeads(l.beads)
    setSelection(new Set()) // selection keys belong to the old active layer
    setPlacing(null)
    patternBaseRef.current = null
  }

  const makeActive = (l) => {
    activeIdRef.current = l.id
    beadsRef.current = l.beads
    setActiveId(l.id)
    setBeads(l.beads)
  }

  const addLayer = () => {
    pushHistory(currentDoc())
    const l = makeLayer(`Layer ${layersRef.current.length + 1}`)
    const idx = layersRef.current.findIndex((x) => x.id === activeIdRef.current)
    const nl = [...layersRef.current]
    nl.splice(idx + 1, 0, l) // insert just above the active layer
    layersRef.current = nl
    setLayers(nl)
    makeActive(l)
    setSelection(new Set())
    setPlacing(null)
  }

  const duplicateLayer = (id) => {
    pushHistory(currentDoc())
    const idx = layersRef.current.findIndex((l) => l.id === id)
    const src = layersRef.current[idx]
    const copy = { ...makeLayer(`${src.name} copy`, new Map(src.beads)), visible: src.visible }
    const nl = [...layersRef.current]
    nl.splice(idx + 1, 0, copy)
    layersRef.current = nl
    setLayers(nl)
    makeActive(copy)
    setSelection(new Set())
    setPlacing(null)
  }

  const deleteLayer = (id) => {
    if (layersRef.current.length <= 1) return // always keep at least one layer
    pushHistory(currentDoc())
    const nl = layersRef.current.filter((l) => l.id !== id)
    layersRef.current = nl
    setLayers(nl)
    if (activeIdRef.current === id) makeActive(nl[nl.length - 1])
    setSelection(new Set())
    setPlacing(null)
  }

  // Merge a layer DOWN into the one below it; top-wins, so the upper layer's
  // beads overwrite the lower's where they share a node.
  const mergeDown = (id) => {
    const idx = layersRef.current.findIndex((l) => l.id === id)
    if (idx <= 0) return // nothing below to merge into
    pushHistory(currentDoc())
    const upper = layersRef.current[idx]
    const lower = layersRef.current[idx - 1]
    const merged = new Map(lower.beads)
    for (const [k, v] of upper.beads) merged.set(k, v)
    const lowerMerged = { ...lower, beads: merged }
    const nl = [...layersRef.current]
    nl[idx - 1] = lowerMerged
    nl.splice(idx, 1)
    layersRef.current = nl
    setLayers(nl)
    makeActive(lowerMerged)
    setSelection(new Set())
    setPlacing(null)
  }

  // dir +1 = move up toward the top, -1 = down toward the bottom. Grouped
  // layers don't move individually — there's no drag-reorder yet, so moving
  // one out of its contiguous block would corrupt the group; Group/Ungroup
  // is the only way to change a grouped layer's position.
  const moveLayer = (id, dir) => {
    const idx = layersRef.current.findIndex((l) => l.id === id)
    if (layersRef.current[idx]?.groupId) return
    const j = idx + dir
    if (j < 0 || j >= layersRef.current.length) return
    if (layersRef.current[j]?.groupId) return
    pushHistory(currentDoc())
    const nl = [...layersRef.current]
    const [m] = nl.splice(idx, 1)
    nl.splice(j, 0, m)
    layersRef.current = nl
    setLayers(nl)
  }

  const renameLayer = (id, name) => {
    const nl = layersRef.current.map((l) => (l.id === id ? { ...l, name } : l))
    layersRef.current = nl
    setLayers(nl)
  }
  const toggleVisible = (id) => {
    const nl = layersRef.current.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    layersRef.current = nl
    setLayers(nl)
    requestRedraw()
  }
  const toggleLock = (id) => {
    const nl = layersRef.current.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l))
    layersRef.current = nl
    setLayers(nl)
  }

  // ---- layer GROUPS (Procreate-style folders) -------------------------------
  // Model stays a flat `layers` array (every hot path above is untouched);
  // `groups` is a small parallel list and members carry a matching `groupId`.
  // Content changes (group/ungroup/flatten) are one undo step, like the layer
  // ops above; visibility/lock/rename/collapse are metadata (not undoable),
  // same policy as the per-layer toggles.
  const guid = () => 'g_' + uid()

  // Group the layer with the one directly BELOW it: joins that layer's group
  // if it has one, else forms a new group. Only offered on an ungrouped layer
  // (see the Group button's disabled condition) so this always just extends
  // a contiguous block by one — never needs to reorder anything.
  const groupWithBelow = (id) => {
    const idx = layersRef.current.findIndex((l) => l.id === id)
    if (idx <= 0) return
    const layer = layersRef.current[idx]
    if (layer.groupId) return
    const below = layersRef.current[idx - 1]
    pushHistory(currentDoc())
    let gid = below.groupId
    let ng = groupsRef.current
    // below has no group yet: form a new one and tag BOTH layers (below
    // wasn't grouped before, so it needs the id too, not just the active one)
    const alsoTagBelow = !gid
    if (!gid) {
      gid = guid()
      ng = [...groupsRef.current, { id: gid, name: 'Group', visible: true, locked: false, collapsed: false }]
    }
    const nl = layersRef.current.map((l) =>
      (l.id === id || (alsoTagBelow && l.id === below.id)) ? { ...l, groupId: gid } : l
    )
    layersRef.current = nl
    groupsRef.current = ng
    setLayers(nl)
    setGroups(ng)
  }

  const ungroupLayer = (id) => {
    const layer = layersRef.current.find((l) => l.id === id)
    if (!layer || !layer.groupId) return
    pushHistory(currentDoc())
    const gid = layer.groupId
    const nl = layersRef.current.map((l) => (l.id === id ? { ...l, groupId: undefined } : l))
    const stillUsed = nl.some((l) => l.groupId === gid)
    const ng = stillUsed ? groupsRef.current : groupsRef.current.filter((g) => g.id !== gid)
    layersRef.current = nl
    groupsRef.current = ng
    setLayers(nl)
    setGroups(ng)
  }

  // Merge a group's bead layers top-wins into ONE layer at the bottom
  // member's slot — same rule as mergeDown, one undo step.
  const flattenGroup = (gid) => {
    const idxs = layersRef.current.map((l, i) => (l.groupId === gid ? i : -1)).filter((i) => i >= 0)
    if (idxs.length < 2) return
    pushHistory(currentDoc())
    const merged = new Map()
    for (const i of idxs) for (const [k, v] of layersRef.current[i].beads) merged.set(k, v)
    const g = groupsRef.current.find((x) => x.id === gid)
    const flat = makeLayer(g ? g.name : 'Group', merged)
    const nl = []
    let inserted = false
    for (const l of layersRef.current) {
      if (l.groupId === gid) {
        if (!inserted) { nl.push(flat); inserted = true }
        continue
      }
      nl.push(l)
    }
    const ng = groupsRef.current.filter((x) => x.id !== gid)
    layersRef.current = nl
    groupsRef.current = ng
    setLayers(nl)
    setGroups(ng)
    makeActive(flat)
    setSelection(new Set())
    setPlacing(null)
  }

  const toggleGroupVisible = (gid) => {
    const ng = groupsRef.current.map((g) => (g.id === gid ? { ...g, visible: !g.visible } : g))
    groupsRef.current = ng
    setGroups(ng)
    requestRedraw()
  }
  const toggleGroupLocked = (gid) => {
    const ng = groupsRef.current.map((g) => (g.id === gid ? { ...g, locked: !g.locked } : g))
    groupsRef.current = ng
    setGroups(ng)
  }
  const toggleGroupCollapsed = (gid) => {
    const ng = groupsRef.current.map((g) => (g.id === gid ? { ...g, collapsed: !g.collapsed } : g))
    groupsRef.current = ng
    setGroups(ng)
  }
  const renameGroup = (gid, name) => {
    const ng = groupsRef.current.map((g) => (g.id === gid ? { ...g, name } : g))
    groupsRef.current = ng
    setGroups(ng)
  }

  // effective visibility = the layer's own flag AND its group's (ungrouped ⇒ just its own)
  const layerVisible = (l, gs) => l.visible && (!l.groupId || gs.find((g) => g.id === l.groupId)?.visible !== false)

  // Small live-render preview for a layers-panel row — same flat-colour-block
  // approach as the gallery card thumbnail (see makeThumb above), just sized
  // for the panel and scoped to one layer's own beads (cheap: only iterates
  // that layer's placed beads, not the whole grid).
  const LP_THUMB_W = 34
  const LP_THUMB_H = 24
  const layerThumb = (l) => {
    if (!l.beads.size || !cols || !rows) return null
    const canvas = document.createElement('canvas')
    canvas.width = LP_THUMB_W
    canvas.height = LP_THUMB_H
    const ctx = canvas.getContext('2d')
    const s = Math.min(LP_THUMB_W / cols, LP_THUMB_H / rows)
    const ox = (LP_THUMB_W - cols * s) / 2
    const oy = (LP_THUMB_H - rows * s) / 2
    const cell = Math.max(1, Math.ceil(s))
    for (const [k, v] of l.beads) {
      const [c, r] = k.split(',').map(Number)
      ctx.fillStyle = decodeBead(v).color
      ctx.fillRect(ox + c * s, oy + r * s, cell, cell)
    }
    return canvas.toDataURL('image/png')
  }

  const activeLayer = layers.find((l) => l.id === activeId) || null
  const activeGroup = activeLayer?.groupId ? groups.find((g) => g.id === activeLayer.groupId) : null
  const canEdit = !!activeLayer && activeLayer.visible && !activeLayer.locked &&
    (!activeGroup || (activeGroup.visible !== false && !activeGroup.locked))
  canEditRef.current = canEdit

  // Per-cell tilt (radians) — defined by the technique (3-bead woven tilt /
  // 1-bead upright). See each module's tiltFor.
  const tiltFor = useCallback(
    (col, row) => tech.tiltFor(col, row),
    [tech]
  )

  // ---- background ----
  // On screen the canvas always has a real background (solid colour or image);
  // transparency is purely an EXPORT choice (exportBg below).
  const [bg, setBg] = useState({ type: 'solid', color: '#FFFFFF', image: null })
  const bgImgRef = useRef(null)

  // Background-image placement: offset (doc px) + scale on top of the cover
  // fit, so the reference design can be positioned under the beads. While
  // bgAdjust is on, canvas gestures move/resize the IMAGE instead of painting.
  const [bgT, setBgT] = useState({ x: 0, y: 0, scale: 1 })
  const [bgShown, setBgShown] = useState(true) // hide ⇒ falls back to the solid colour
  const [bgAdjust, setBgAdjust] = useState(false)
  const bgAdjustRef = useRef(false)
  bgAdjustRef.current = bgAdjust

  // resize the image by `factor` keeping the doc point under (sx,sy) fixed
  const imageZoomAt = (factor, sx, sy) => {
    const m = screenToDoc(sx, sy, view)
    setBgT((t) => {
      const ns = clampNum(t.scale * factor, 0.2, 8)
      const ff = ns / t.scale
      const cx = geo.width / 2 + t.x
      const cy = geo.height / 2 + t.y
      return {
        scale: ns,
        x: m.x - (m.x - cx) * ff - geo.width / 2,
        y: m.y - (m.y - cy) * ff - geo.height / 2,
      }
    })
  }
  const imageZoomAtRef = useRef(imageZoomAt)
  imageZoomAtRef.current = imageZoomAt

  // ---- printed-chart settings ----
  const [printBeadMm, setPrintBeadMm] = useState(8) // fixed bead size on paper (mm)
  const [exportBg, setExportBg] = useState('transparent') // transparent | screen
  const beadRatio = beadMM.h / beadMM.w

  // ---- palettes ----
  const [palette, setPalette] = useState(DEFAULT_PALETTE)
  const [savedPalettes, setSavedPalettes] = useState([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSavedPalettes(JSON.parse(raw))
    } catch (e) {}
  }, [])

  const persistPalettes = (list) => {
    setSavedPalettes(list)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch (e) {}
  }

  // ---- mutate beads ----
  const floodFill = useCallback(
    (cell, useColor = color) => {
      if (!cell || !canEditRef.current) return
      const useVal = encodeBead(useColor, stitchStyle)
      commit((prev) => {
        const target = prev.get(key(cell.col, cell.row)) || null
        if (target === useVal) return prev
        const next = new Map(prev)
        const stack = [cell]
        const seen = new Set()
        while (stack.length) {
          const { col, row } = stack.pop()
          if (col < 0 || col >= cols || row < 0 || row >= rows) continue
          if (!tech.beadExists(col, row)) continue // skip empty apex nodes
          const k = key(col, row)
          if (seen.has(k)) continue
          seen.add(k)
          const cur = prev.get(k) || null
          if (cur !== target) continue // boundary: stop at differently-colored/styled beads
          next.set(k, useVal)
          // technique-defined neighbours (3-bead staggered / 1-bead orthogonal)
          for (const n of tech.floodNeighbors(col, row)) stack.push(n)
        }
        return next
      })
    },
    [color, stitchStyle, cols, rows, commit, tech]
  )

  // beads covered by the brush at doc point (x,y): the bead under the cursor for
  // brush 1, or all existing beads within a radius that grows with brush size.
  const brushCells = useCallback(
    (x, y) => {
      if (brush <= 1) {
        const n = tech.beadAt(geo, x, y)
        return n ? [n] : []
      }
      const out = []
      const radius = (brush - 1) * Math.min(geo.Px, geo.Py) * 0.62 + Bw * 0.6
      const approxRow = Math.round((y - geo.padY) / geo.Py)
      const approxCol = Math.round((x - geo.padX) / geo.Px)
      const span = brush + 1
      for (let row = approxRow - span; row <= approxRow + span; row++) {
        if (row < 0 || row >= rows) continue
        for (let col = approxCol - span; col <= approxCol + span; col++) {
          if (col < 0 || col >= cols) continue
          if (!tech.beadExists(col, row)) continue
          const { cx, cy } = geo.centerFor(col, row)
          const dx = x - cx
          const dy = y - cy
          if (dx * dx + dy * dy <= radius * radius) out.push({ col, row })
        }
      }
      return out
    },
    [brush, geo, Bw, rows, cols, tech]
  )

  const paintBrush = useCallback(
    (x, y, mode) => {
      const cells = brushCells(x, y)
      if (!cells.length) return
      const val = encodeBead(color, stitchStyle)
      applyBeads((prev) => {
        // Freehand strokes call this on every pointer event (up to ~240Hz).
        // Clone the stroke's base Map ONCE (lazily, on the first real change)
        // and keep mutating that same private copy in place for the rest of
        // the stroke, instead of `new Map(prev)` on every event — that clone
        // was the dominant per-event cost on a dense design. Reset at stroke
        // start/end (onPointerDown / endDrag).
        let next = strokeWorking.current
        for (const { col, row } of cells) {
          const k = key(col, row)
          if (mode === 'erase') {
            if ((next || prev).has(k)) {
              if (!next) { next = new Map(prev); strokeWorking.current = next }
              next.delete(k)
            }
          } else if ((next || prev).get(k) !== val) {
            if (!next) { next = new Map(prev); strokeWorking.current = next }
            next.set(k, val)
          }
        }
        return next || prev
      }, true) // silent: strokes repaint via rAF, no React render per event
    },
    [brushCells, color, stitchStyle, applyBeads]
  )

  // ---- selection (marquee Select tool) ----
  const finalizeSelection = useCallback(
    (rect) => {
      if (!rect) return
      const x0 = Math.min(rect.x0, rect.x1)
      const x1 = Math.max(rect.x0, rect.x1)
      const y0 = Math.min(rect.y0, rect.y1)
      const y1 = Math.max(rect.y0, rect.y1)
      const sel = new Set()
      const r0 = Math.max(0, Math.floor((y0 - geo.padY) / geo.Py) - 1)
      const r1 = Math.min(rows, Math.ceil((y1 - geo.padY) / geo.Py) + 1)
      const c0 = Math.max(0, Math.floor((x0 - geo.padX - geo.rowOffset) / geo.Px) - 1)
      const c1 = Math.min(cols, Math.ceil((x1 - geo.padX) / geo.Px) + 1)
      for (let row = r0; row < r1; row++) {
        for (let col = c0; col < c1; col++) {
          if (!tech.beadExists(col, row)) continue
          const k = key(col, row)
          if (!beads.has(k)) continue // only coloured beads are selectable
          const { cx, cy } = geo.centerFor(col, row)
          if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) sel.add(k)
        }
      }
      setSelection(sel)
    },
    [geo, rows, cols, beads, tech]
  )

  const clearSelection = () => setSelection(new Set())

  const recolorSelection = () => {
    if (!selection.size || !canEdit) return
    pushRecent(color)
    commit((prev) => {
      const next = new Map(prev)
      // Recolour changes the colour only — the stitch KEEPS whatever shape
      // (cross/line) it already had, matching the current tool's stitchStyle
      // would silently reshape stitches the user never asked to reshape.
      for (const k of selection) {
        const { style } = decodeBead(prev.get(k))
        next.set(k, encodeBead(color, style))
      }
      return next
    })
  }

  const deleteSelection = () => {
    if (!selection.size || !canEdit) return
    commit((prev) => {
      const next = new Map(prev)
      for (const k of selection) next.delete(k)
      return next
    })
    clearSelection()
  }

  // ---- duplicate / move & place ----------------------------------------------
  // Duplicate copies the selected coloured beads into a ghost "stamp"; Move
  // turns the selection itself into the ghost (originals hidden until placed
  // or cancelled). The ghost follows pen/mouse drags on the canvas; Place
  // commits as one undo step. placing = { mode: 'copy'|'move', motif:
  // [{dc,dr,fill}], baseC, baseR, c, r, hide } — (c,r) is the current origin
  // cell, (baseC,baseR) the original one (needed for parity), hide = original
  // bead keys to suppress while a move is in flight.
  const [placing, setPlacing] = useState(null)
  const placeDrag = useRef(null) // grab offset between pointer and ghost origin

  // Snap a dragged copy's origin to a valid cell. The 3-bead weave constrains
  // this to parity-valid origins (half-density + tilt checkerboard); the 1-bead
  // grid accepts any cell. The rule lives in the technique.
  const snapPlace = (x, y, pl) => tech.snapPlace(geo, x, y, pl)

  const startPlacing = (mode) => {
    if (!selection.size || !canEdit) return
    let minC = Infinity
    let minR = Infinity
    const cells = []
    for (const k of selection) {
      const fill = beadsRef.current.get(k)
      if (!fill) continue
      const [c, r] = k.split(',').map(Number)
      cells.push({ c, r, fill })
      if (c < minC) minC = c
      if (r < minR) minR = r
    }
    if (!cells.length) return
    // technique origin snap (3-bead even-snaps for parity; 1-bead is identity)
    ;({ minC, minR } = tech.snapMotifOrigin(minC, minR))
    const motif = cells.map(({ c, r, fill }) => ({ dc: c - minC, dr: r - minR, fill }))
    const { dc: offC, dr: offR } = tech.copyStartOffset
    setPlacing({
      mode,
      motif,
      baseC: minC,
      baseR: minR,
      // a copy starts nudged off the original (a technique-valid offset) so the
      // user can see it's a separate copy; a move starts in place — the
      // originals fade where they are
      c: mode === 'move' ? minC : minC + offC,
      r: mode === 'move' ? minR : minR + offR,
      // a move hides the originals while in flight; nothing is deleted until
      // Place, so Cancel simply unhides them
      hide: mode === 'move' ? new Set(cells.map(({ c, r }) => key(c, r))) : null,
    })
    clearSelection() // one highlight at a time: the ghost is the focus now
  }

  const placeMotif = () => {
    if (!placing || !canEdit) return
    const sel = new Set()
    commit((prev) => {
      let next = null
      const ensure = () => (next = next || new Map(prev))
      if (placing.mode === 'move') {
        for (const k of placing.hide) if (prev.has(k)) ensure().delete(k)
      }
      for (const { dc, dr, fill } of placing.motif) {
        const c = placing.c + dc
        const r = placing.r + dr
        if (c < 0 || c >= cols || r < 0 || r >= rows || !tech.beadExists(c, r)) continue
        const k = key(c, r)
        sel.add(k)
        if ((next || prev).get(k) !== fill) ensure().set(k, fill)
      }
      return next || prev
    })
    setSelection(sel) // the placed beads become the selection — chain freely
    setPlacing(null)
  }

  // ---- pattern maker -------------------------------------------------------
  // Repeats the selected motif across the WHOLE canvas in a classic textile
  // layout: grid (straight repeat), brick (every other row of repeats shifts
  // sideways by half a tile) or half-drop (every other column of repeats drops
  // by half a tile). The repeat lattice is anchored on the motif itself, so the
  // original beads are one tile of the pattern. Every offset is kept EVEN so
  // the weave's apex/base row parity and the tilt checkerboard survive (odd
  // shifts would put horizontal apex beads on tilted rows, and vice versa).
  const [patternGap, setPatternGap] = useState(0) // empty beads between repeats

  const makePattern = (mode) => {
    if (!selection.size || !canEdit) return
    // Clicking another layout (or re-clicking after a gap change) REPLACES the
    // previous pattern instead of stacking on top of it: while the last edit
    // was a pattern apply, we rebuild from the beads as they were before it.
    // Any other edit nulls patternBaseRef (in applyBeads) and ends swapping.
    const base = patternBaseRef.current || beadsRef.current
    // motif = the selected coloured beads, relative to an even-snapped origin
    let minC = Infinity
    let minR = Infinity
    let maxC = -Infinity
    let maxR = -Infinity
    const cells = []
    for (const k of selection) {
      const fill = base.get(k)
      if (!fill) continue
      const [c, r] = k.split(',').map(Number)
      cells.push({ c, r, fill })
      if (c < minC) minC = c
      if (c > maxC) maxC = c
      if (r < minR) minR = r
      if (r > maxR) maxR = r
    }
    if (!cells.length) return
    ;({ minC, minR } = tech.snapMotifOrigin(minC, minR))
    const motif = cells.map(({ c, r, fill }) => ({ dc: c - minC, dr: r - minR, fill }))
    // tile pitch = motif size + gap, snapped by the technique (3-bead rounds UP
    // to even for weave parity; 1-bead keeps the exact size)
    const px = tech.evenUp(maxC - minC + 1 + patternGap)
    const py = tech.evenUp(maxR - minR + 1 + patternGap)
    // the brick / half-drop shift: half a tile (technique-snapped) — never 0,
    // or a small motif would degrade brick / half-drop into a plain grid
    const half = tech.patternHalf
    const next = new Map(base)
    // tile indices covering the grid (one extra column for the brick shift)
    const i0 = -Math.ceil(minC / px) - 1
    const i1 = Math.ceil((cols - minC) / px)
    const j0 = -Math.ceil(minR / py)
    const j1 = Math.ceil((rows - minR) / py)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (i === 0 && j === 0) continue // the motif itself stays as-is
        let oc = minC + i * px
        let or = minR + j * py
        const oddBand = (((mode === 'brick' ? j : i) % 2) + 2) % 2 === 1
        if (mode === 'brick' && oddBand) oc += half(px)
        if (mode === 'halfdrop' && oddBand) or += half(py)
        for (const { dc, dr, fill } of motif) {
          const c = oc + dc
          const r = or + dr
          if (c < 0 || c >= cols || r < 0 || r >= rows || !tech.beadExists(c, r)) continue
          next.set(key(c, r), fill)
        }
      }
    }
    // first apply pushes ONE undo step (back to the pre-pattern design);
    // layout swaps reuse it, so undo from any layout returns to the motif. The
    // snapshot's active layer holds `base` (== beadsRef.current on first apply).
    if (!patternBaseRef.current) pushHistory(currentDoc())
    applyBeads(next)
    patternBaseRef.current = base // re-arm: applyBeads just cleared it
  }

  // desktop keyboard: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z redo
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      // Only skip real text fields — the old guard required e.target ===
      // document.body, which silently swallowed undo any time focus sat on a
      // button (zoom control, tool strip, "+ New artwork", ...) since clicking
      // ANY button moves focus off body.
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ---- canvas drawing ----
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

  // small repeating tile for the transparent-background checker
  const checkerTile = useMemo(() => {
    if (typeof document === 'undefined') return null
    const c = document.createElement('canvas')
    c.width = 16
    c.height = 16
    const x = c.getContext('2d')
    x.fillStyle = '#f3f3f4'; x.fillRect(0, 0, 16, 16)
    x.fillStyle = '#e3e3e5'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8)
    return c
  }, [])

  // track the pasteboard viewport size; the canvas fills it exactly
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const drawScene = useCallback(
    (ctx) => {
      const { w: vw, h: vh } = viewport
      const { scale, tx, ty, rot } = view
      const docW = geo.width
      const docH = geo.height

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      ctx.clearRect(0, 0, vw, vh)
      // everything below is in document space (pan + zoom + rotation baked into
      // the transform): screen = scale · R(rot) · doc + t
      const vcos = Math.cos(rot)
      const vsin = Math.sin(rot)
      ctx.setTransform(
        DPR * scale * vcos, DPR * scale * vsin,
        -DPR * scale * vsin, DPR * scale * vcos,
        tx * DPR, ty * DPR
      )

      // document background (a hidden image falls back to the solid colour)
      const imageShowing = bg.type === 'image' && bgShown && bgImgRef.current
      if (bg.type === 'solid' || (bg.type === 'image' && !imageShowing)) {
        ctx.fillStyle = bg.color
        ctx.fillRect(0, 0, docW, docH)
      } else if (imageShowing) {
        const img = bgImgRef.current
        const s = Math.max(docW / img.width, docH / img.height) * bgT.scale
        const dw = img.width * s
        const dh = img.height * s
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, docW, docH)
        ctx.clip() // the image never spills past the canvas edges
        ctx.drawImage(img, (docW - dw) / 2 + bgT.x, (docH - dh) / 2 + bgT.y, dw, dh)
        ctx.restore()
      } else if (checkerTile) {
        ctx.fillStyle = ctx.createPattern(checkerTile, 'repeat')
        ctx.fillRect(0, 0, docW, docH)
      }

      // visible cell range — cull off-screen beads so ANY document size stays
      // fast. Under rotation the visible doc area is a rotated rectangle, so use
      // the doc-space bounding box of the four viewport corners (a bit larger,
      // never misses a bead).
      const vc = [
        screenToDoc(0, 0, view), screenToDoc(vw, 0, view),
        screenToDoc(0, vh, view), screenToDoc(vw, vh, view),
      ]
      const docLeft = Math.min(vc[0].x, vc[1].x, vc[2].x, vc[3].x)
      const docRight = Math.max(vc[0].x, vc[1].x, vc[2].x, vc[3].x)
      const docTop = Math.min(vc[0].y, vc[1].y, vc[2].y, vc[3].y)
      const docBottom = Math.max(vc[0].y, vc[1].y, vc[2].y, vc[3].y)
      const r0 = Math.max(0, Math.floor((docTop - geo.padY) / geo.Py) - 1)
      const r1 = Math.min(rows, Math.ceil((docBottom - geo.padY) / geo.Py) + 1)
      const c0 = Math.max(0, Math.floor((docLeft - geo.padX - geo.rowOffset) / geo.Px) - 1)
      const c1 = Math.min(cols, Math.ceil((docRight - geo.padX) / geo.Px) + 1)

      // level of detail: simplify / drop outlines when beads are tiny on screen
      const onScreenBw = Bw * scale
      const drawOutlines = onScreenBw > 5
      const simple = onScreenBw < 4
      ctx.lineWidth = 1.25 / scale
      ctx.strokeStyle = '#cdcac3'

      // stitches draw at true cell size — their tips meet at the cell corners so
      // runs read as continuous diagonals (no spacing/packing on fixed fabric).
      const dw = Bw
      const dh = Bh

      // composite the visible layers TOP-wins. The active layer reads from
      // beadsRef (live, so silent stroke repaints show); the others read their
      // own Maps from `layers` state (they can't change mid-stroke). `beads`
      // stays in the deps so committed active-layer edits still trigger redraw.
      const liveBeads = beadsRef.current
      const visLayers = layers.filter((l) => layerVisible(l, groups))
      const aId = activeId
      const fillAt = (k) => {
        for (let i = visLayers.length - 1; i >= 0; i--) {
          const lay = visLayers[i]
          if (lay.id === aId) {
            // beads being MOVED draw only as the ghost, not at their old spot
            // (nothing is deleted until Place, so Cancel just unhides them)
            if (placing?.hide?.has(k)) continue
            const v = liveBeads.get(k)
            if (v) return v
          } else {
            const v = lay.beads.get(k)
            if (v) return v
          }
        }
        return undefined
      }
      // light aida fabric grid: thin lines at every cell boundary, so empty cells
      // read as woven fabric rather than as squares behind the stitches. Skipped
      // over a reference image (let it show through) and when cells are tiny.
      if (drawOutlines && !imageShowing) {
        const gx0 = geo.padX - geo.Px / 2
        const gy0 = geo.padY - geo.Py / 2
        const yTop = Math.max(0, gy0)
        const yBot = Math.min(docH, gy0 + rows * geo.Py)
        const xL = Math.max(0, gx0)
        const xR = Math.min(docW, gx0 + cols * geo.Px)
        ctx.beginPath()
        for (let c = c0; c <= c1; c++) {
          const x = gx0 + c * geo.Px
          if (x < -0.01 || x > docW + 0.01) continue
          ctx.moveTo(x, yTop)
          ctx.lineTo(x, yBot)
        }
        for (let r = r0; r <= r1; r++) {
          const y = gy0 + r * geo.Py
          if (y < -0.01 || y > docH + 0.01) continue
          ctx.moveTo(xL, y)
          ctx.lineTo(xR, y)
        }
        ctx.lineWidth = 1 / scale
        ctx.strokeStyle = '#e4e0d6' // light aida thread — not too dark
        ctx.stroke()
      }

      // stitches only (empty cells are just the fabric grid above — no square)
      for (let row = r0; row < r1; row++) {
        for (let col = c0; col < c1; col++) {
          if (!tech.beadExists(col, row)) continue
          const raw = fillAt(key(col, row))
          if (!raw) continue
          const { color: fill, style: fillStyle } = decodeBead(raw)
          const { cx, cy } = geo.centerFor(col, row)
          if (simple) {
            ctx.fillStyle = fill
            ctx.fillRect(cx - dw / 2, cy - dh / 2, dw, dh)
            continue
          }
          const tilt = tiltFor(col, row)
          if (tech.fillBead) {
            tech.fillBead(ctx, cx, cy, dw, dh, fill, tilt, fillStyle)
          } else {
            tech.beadPath(ctx, cx, cy, dw, dh, tilt)
            ctx.fillStyle = fill
            ctx.fill()
          }
        }
      }

      // selection highlight (accent ring around selected beads)
      if (selection.size) {
        ctx.lineWidth = 2 / scale
        ctx.strokeStyle = T.accent
        for (let row = r0; row < r1; row++) {
          for (let col = c0; col < c1; col++) {
            if (!tech.beadExists(col, row) || !selection.has(key(col, row))) continue
            const { cx, cy } = geo.centerFor(col, row)
            tech.beadPath(ctx, cx, cy, dw * 1.08, dh * 1.08, tiltFor(col, row))
            ctx.stroke()
          }
        }
      }

      // live marquee rectangle
      if (marquee) {
        const mx = Math.min(marquee.x0, marquee.x1)
        const my = Math.min(marquee.y0, marquee.y1)
        const mw = Math.abs(marquee.x1 - marquee.x0)
        const mh = Math.abs(marquee.y1 - marquee.y0)
        ctx.fillStyle = 'rgba(214,0,28,0.08)'
        ctx.fillRect(mx, my, mw, mh)
        ctx.lineWidth = 1.5 / scale
        ctx.strokeStyle = T.accent
        ctx.setLineDash([6 / scale, 4 / scale])
        ctx.strokeRect(mx, my, mw, mh)
        ctx.setLineDash([])
      }

      // ghost of the duplicated motif awaiting placement (drag moves it) — a
      // plain tinted cell outline (not the real stitch shape) is enough for a
      // drag preview, but still needs the raw value decoded to a real CSS colour
      if (placing) {
        ctx.globalAlpha = 0.55
        for (const { dc, dr, fill } of placing.motif) {
          const c = placing.c + dc
          const r = placing.r + dr
          if (c < 0 || c >= cols || r < 0 || r >= rows || !tech.beadExists(c, r)) continue
          const { cx, cy } = geo.centerFor(c, r)
          tech.beadPath(ctx, cx, cy, dw, dh, tiltFor(c, r))
          ctx.fillStyle = decodeBead(fill).color
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
    },
    [viewport, view, geo, beads, layers, groups, activeId, bg, bgT, bgShown, Bw, Bh, cols, rows, tiltFor, checkerTile, DPR, selection, marquee, pack, placing, tech]
  )
  drawRef.current = drawScene // the rAF repaint path always uses the latest

  // Device-pixel transform matrix matching drawScene's ctx.setTransform (same
  // scale·R(rot)+t baked in), so a cached raster can be re-projected onto a
  // NEW view without touching any bead.
  const devMat = (v) => {
    const c = Math.cos(v.rot || 0), s = Math.sin(v.rot || 0)
    return new DOMMatrix([
      DPR * v.scale * c, DPR * v.scale * s,
      -DPR * v.scale * s, DPR * v.scale * c,
      v.tx * DPR, v.ty * DPR,
    ])
  }
  // Blit the last full render through the transform DELTA between the view it
  // was cached at and the current view — one drawImage instead of iterating
  // every placed stitch. Falls back to a full render if there's no cache yet.
  const drawBlit = (ctx) => {
    const cache = sceneCacheRef.current
    if (!cache || !cacheViewRef.current) { drawScene(ctx); return }
    const canvas = ctx.canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const m = devMat(view).multiply(devMat(cacheViewRef.current).invertSelf())
    ctx.setTransform(m)
    ctx.drawImage(cache, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
  drawBlitRef.current = drawBlit

  const updateSceneCache = (canvas) => {
    let cache = sceneCacheRef.current
    if (!cache || cache.width !== canvas.width || cache.height !== canvas.height) {
      cache = document.createElement('canvas')
      cache.width = canvas.width
      cache.height = canvas.height
      sceneCacheRef.current = cache
    }
    cache.getContext('2d').drawImage(canvas, 0, 0)
    cacheViewRef.current = view
  }
  updateSceneCacheRef.current = updateSceneCache

  // size the canvas to the viewport (never to the document)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = Math.max(1, Math.round(viewport.w * DPR))
    canvas.height = Math.max(1, Math.round(viewport.h * DPR))
    canvas.style.width = `${viewport.w}px`
    canvas.style.height = `${viewport.h}px`
  }, [viewport, DPR])

  // redraw whenever the scene changes — through requestRedraw so this shares
  // the same fast-blit/full-render chooser as the stroke rAF path
  useEffect(() => {
    requestRedraw()
  }, [drawScene, requestRedraw])

  // fit the document into the viewport, centred
  const fitView = useCallback(() => {
    const { w: vw, h: vh } = viewport
    if (vw < 2 || vh < 2) return
    const margin = 48
    const scale = Math.min((vw - margin) / geo.width, (vh - margin) / geo.height, 4)
    // fit also straightens the canvas (rot 0), so it doubles as "reset rotation"
    setView({ scale, tx: (vw - geo.width * scale) / 2, ty: (vh - geo.height * scale) / 2, rot: 0 })
  }, [viewport, geo.width, geo.height])

  // auto-fit on first sizing, and whenever the canvas cm size changes
  const fittedRef = useRef(false)
  useEffect(() => {
    if (viewport.w > 2 && !fittedRef.current) {
      fittedRef.current = true
      fitView()
    }
  }, [viewport, fitView])
  useEffect(() => {
    fitView()
  }, [canvasCm.w, canvasCm.h]) // eslint-disable-line react-hooks/exhaustive-deps

  // zoom toward a screen point by a factor (keeps that point fixed)
  const zoomAt = useCallback((factor, sx, sy) => {
    setView((v) => {
      const ns = clampNum(+(v.scale * factor).toFixed(4), 0.02, 8)
      // keep the doc point under (sx,sy) fixed, accounting for rotation
      const d = screenToDoc(sx, sy, v)
      const c = Math.cos(v.rot || 0)
      const s = Math.sin(v.rot || 0)
      const rx = c * d.x - s * d.y
      const ry = s * d.x + c * d.y
      return { ...v, scale: ns, tx: sx - ns * rx, ty: sy - ns * ry }
    })
  }, [])

  // wheel = zoom toward cursor (no scrollbars anywhere)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      const sx = e.clientX - r.left
      const sy = e.clientY - r.top
      // in image-adjust mode the wheel resizes the background image instead
      if (bgAdjustRef.current) {
        imageZoomAtRef.current(e.deltaY < 0 ? 1.08 : 1 / 1.08, sx, sy)
        return
      }
      beginInteract()
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, sx, sy)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [zoomAt, beginInteract])

  // ---- pointer interaction ----
  const dragging = useRef(false)
  const panning = useRef(null)
  const marqueeRef = useRef(null)
  const spaceHeld = useRef(false)
  const [grabbing, setGrabbing] = useState(false)

  // hold Space to pan (Figma-style); middle-mouse drag also pans
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space' && !e.repeat && e.target === document.body) {
        e.preventDefault()
        spaceHeld.current = true
        setGrabbing(true)
      }
    }
    const up = (e) => {
      if (e.code === 'Space') {
        spaceHeld.current = false
        setGrabbing(false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // ---- iPad touch gestures (locked iPad-pass decisions #1–3) ----
  // Pencil (pointerType 'pen') and mouse use the active tool. Fingers NEVER
  // paint: one finger pans, two-finger pinch zooms/pans, and quick multi-finger
  // taps map to history (2 fingers = undo, 3 = redo) — Procreate conventions.
  const touchPts = useRef(new Map()) // pointerId -> {x,y,sx,sy} canvas-relative
  const pinchRef = useRef(null) // {dist, mx, my} of the live 2-finger gesture
  const tapRef = useRef(null) // {t0, maxN, moved, valid} for tap detection

  const ptFromEvent = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const startPinchIfTwo = () => {
    if (touchPts.current.size !== 2) { pinchRef.current = null; return }
    const [a, b] = [...touchPts.current.values()]
    pinchRef.current = {
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
      ang: Math.atan2(b.y - a.y, b.x - a.x),
    }
  }

  const docFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return screenToDoc(e.clientX - rect.left, e.clientY - rect.top, view)
  }

  // ---- straight-line snapping --------------------------------------------
  // While drawing/erasing, if the stroke stays near one of the lattice's
  // straight directions (horizontal, or the two weave diagonals) for more
  // than SNAP_BEADS beads, the painted beads snap to a perfect continuous
  // line from the stroke start. Curve away and the stroke falls back to the
  // recorded freehand path.
  const SNAP_BEADS = 3
  const strokeRef = useRef(null) // { start, pts, locked, snapped } per stroke

  // unit vectors of the technique's straight lattice lines + their bead pitch
  const snapAxes = () => tech.snapAxes(geo)

  // Does the whole stroke so far fit a lattice axis? Returns the best axis
  // (longest projection) or null. Every recorded point must stay within one
  // bead-height of the ideal line through the stroke start.
  const evalSnap = (s, p) => {
    const dx = p.x - s.start.x
    const dy = p.y - s.start.y
    const tol = Bh * 0.9
    let best = null
    for (const a of snapAxes()) {
      const proj = dx * a.ux + dy * a.uy
      if (Math.abs(proj) < SNAP_BEADS * a.pitch) continue
      const fits = s.pts.every(
        (q) => Math.abs((q.x - s.start.x) * -a.uy + (q.y - s.start.y) * a.ux) <= tol
      )
      if (!fits) continue
      if (!best || Math.abs(proj) > best.len) {
        best = {
          ux: a.ux * Math.sign(proj),
          uy: a.uy * Math.sign(proj),
          len: Math.abs(proj),
          pitch: a.pitch,
        }
      }
    }
    return best
  }

  // Sample points along the ideal line; dense enough that beadAt catches
  // every bead the line passes through (missing apex nodes stay skipped).
  const lineSamples = (start, snap) => {
    const out = []
    const step = snap.pitch / 4
    for (let t = 0; t <= snap.len; t += step) {
      out.push({ x: start.x + snap.ux * t, y: start.y + snap.uy * t })
    }
    out.push({ x: start.x + snap.ux * snap.len, y: start.y + snap.uy * snap.len })
    return out
  }

  // Rebuild the design as (stroke-start state) + brush applied at each point.
  // Used to repaint the whole stroke as a clean line, or replay it freehand.
  const paintAlong = (base, points) => {
    const val = encodeBead(color, stitchStyle)
    const next = new Map(base)
    for (const q of points) {
      for (const { col, row } of brushCells(q.x, q.y)) {
        const k = key(col, row)
        if (tool === 'erase') next.delete(k)
        else next.set(k, val)
      }
    }
    return next
  }

  const handleStrokePoint = (p) => {
    const s = strokeRef.current
    if (s && !s.locked) {
      // thin the recorded path: pencils fire up to 240 events/s
      const last = s.pts[s.pts.length - 1]
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1) s.pts.push(p)
      const snap = evalSnap(s, p)
      if (snap) {
        // throttle: rebuild the design only when the line gains/loses a sample,
        // not on every pointer event (Map copies at 240Hz crash mobile Safari)
        const n = Math.floor(snap.len / (snap.pitch / 4))
        if (s.snapped && n === s.lastN) return
        s.snapped = true
        s.lastN = n
        strokeWorking.current = null // paintAlong rebuilds from strokeBase; invalidate any freehand accumulator
        applyBeads(paintAlong(strokeBase.current, lineSamples(s.start, snap)), true)
        return
      }
      if (s.snapped) {
        // was a snapped line, now curving: give back the freehand path
        s.snapped = false
        s.locked = true
        strokeWorking.current = null // same: paintAlong replaces beadsRef.current wholesale
        applyBeads(paintAlong(strokeBase.current, s.pts), true)
        return
      }
      // clearly not straight by now → stop evaluating for this stroke
      const len = Math.hypot(p.x - s.start.x, p.y - s.start.y)
      if (len >= SNAP_BEADS * geo.Px * 1.5) s.locked = true
    }
    paintBrush(p.x, p.y, tool)
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture?.(e.pointerId)
    // Blur any focused text field so its native undo (e.g. resizing a canvas-cm
    // Pill back to a prior value) can't fire instead of ours on Ctrl/⌘+Z.
    const ae = document.activeElement
    if (ae && ae !== document.body && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) ae.blur()
    if (e.pointerType === 'touch') {
      if (dragging.current || marqueeRef.current) return // palm while pencil draws
      const p = ptFromEvent(e)
      touchPts.current.set(e.pointerId, { ...p, sx: p.x, sy: p.y })
      const n = touchPts.current.size
      if (n === 1) tapRef.current = { t0: Date.now(), maxN: 1, moved: false, valid: true }
      else if (tapRef.current) tapRef.current.maxN = Math.max(tapRef.current.maxN, n)
      panning.current = n === 1 ? { x: e.clientX, y: e.clientY } : null
      startPinchIfTwo()
      dragging.current = false
      return
    }
    if (bgAdjust || spaceHeld.current || e.button === 1) {
      // image-adjust mode: any pen/mouse drag moves the image (see move handler)
      panning.current = { x: e.clientX, y: e.clientY }
      return
    }
    const p = docFromEvent(e)
    if (placing) {
      // drag moves the ghost copy; keep the grab offset so it doesn't jump
      const o = geo.centerFor(placing.c, placing.r)
      placeDrag.current = { dx: p.x - o.cx, dy: p.y - o.cy }
      return
    }
    if (tool === 'select') {
      marqueeRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
      setMarquee(marqueeRef.current)
      return
    }
    if (!canEditRef.current) return // active layer hidden or locked — no painting
    dragging.current = true
    strokeBase.current = beadsRef.current // history: snapshot at stroke start
    strokeWorking.current = null // fresh per-stroke mutable clone, cloned lazily on first change
    strokeRef.current = { start: p, pts: [], locked: false, snapped: false, lastN: -1 }
    if (tool === 'draw') pushRecent(color)
    paintBrush(p.x, p.y, tool)
  }

  const onPointerMove = (e) => {
    if (e.pointerType === 'touch') {
      const rec = touchPts.current.get(e.pointerId)
      if (!rec) return
      const p = ptFromEvent(e)
      rec.x = p.x
      rec.y = p.y
      if (tapRef.current && Math.hypot(p.x - rec.sx, p.y - rec.sy) > 12) {
        tapRef.current.moved = true
      }
      if (pinchRef.current && touchPts.current.size === 2) {
        // pinch: zoom by the distance ratio, ROTATE by the twist of the two
        // fingers, and pan by the midpoint drift — the doc point between the
        // fingers stays pinched under all three.
        const [a, b] = [...touchPts.current.values()]
        const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const ang = Math.atan2(b.y - a.y, b.x - a.x)
        const g = pinchRef.current
        if (bgAdjust) {
          // image-adjust mode: the pinch resizes/moves the background image
          const mPrev = screenToDoc(g.mx, g.my, view)
          const mNow = screenToDoc(mx, my, view)
          setBgT((t) => {
            const ns = clampNum(t.scale * (dist / g.dist), 0.2, 8)
            const ff = ns / t.scale
            const cx = geo.width / 2 + t.x
            const cy = geo.height / 2 + t.y
            return {
              scale: ns,
              x: mNow.x - (mPrev.x - cx) * ff - geo.width / 2,
              y: mNow.y - (mPrev.y - cy) * ff - geo.height / 2,
            }
          })
        } else {
          beginInteract()
          setView((v) => {
            const ns = clampNum(v.scale * (dist / g.dist), 0.02, 8)
            const nrot = (v.rot || 0) + (ang - g.ang) // snap happens on lift, not per-frame
            // keep the doc point under the old midpoint pinned to the new one
            const d = screenToDoc(g.mx, g.my, v)
            const c = Math.cos(nrot)
            const s = Math.sin(nrot)
            const rx = c * d.x - s * d.y
            const ry = s * d.x + c * d.y
            return { scale: ns, rot: nrot, tx: mx - ns * rx, ty: my - ns * ry }
          })
        }
        pinchRef.current = { dist, mx, my, ang }
        return
      }
      // single finger falls through to the shared pan block
    }
    if (panning.current) {
      const dx = e.clientX - panning.current.x
      const dy = e.clientY - panning.current.y
      panning.current = { x: e.clientX, y: e.clientY }
      if (bgAdjust && bg.type === 'image') {
        // image-adjust mode: dragging moves the image, not the view (rotate the
        // screen delta into doc space so it follows the finger under rotation)
        const c = Math.cos(view.rot || 0)
        const s = Math.sin(view.rot || 0)
        const ddx = (c * dx + s * dy) / view.scale
        const ddy = (-s * dx + c * dy) / view.scale
        setBgT((t) => ({ ...t, x: t.x + ddx, y: t.y + ddy }))
      } else {
        beginInteract()
        setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
      }
      return
    }
    if (placeDrag.current && placing) {
      const p = docFromEvent(e)
      const t = snapPlace(p.x - placeDrag.current.dx, p.y - placeDrag.current.dy, placing)
      if (t.c !== placing.c || t.r !== placing.r) setPlacing({ ...placing, ...t })
      return
    }
    if (marqueeRef.current) {
      const p = docFromEvent(e)
      marqueeRef.current = { ...marqueeRef.current, x1: p.x, y1: p.y }
      setMarquee(marqueeRef.current)
      return
    }
    if (dragging.current) {
      handleStrokePoint(docFromEvent(e))
    }
  }

  const endDrag = () => {
    if (marqueeRef.current) {
      finalizeSelection(marqueeRef.current)
      marqueeRef.current = null
      setMarquee(null)
    }
    // history: commit the stroke as ONE undo step, only if it changed beads.
    // Silent strokes never updated layersRef, so its active entry still holds
    // the PRE-stroke Map — currentDoc() is the correct snapshot to undo to.
    if (strokeBase.current && strokeBase.current !== beadsRef.current) {
      pushHistory(currentDoc())
      setBeads(beadsRef.current) // strokes were silent — sync React state once
      syncActiveLayer() // and fold the new beads into the layer stack
    }
    strokeBase.current = null
    strokeRef.current = null
    dragging.current = false
    panning.current = null
    placeDrag.current = null
  }

  // When a two-finger gesture ends, gently snap the rotation to the nearest
  // right angle if it's close (≈7°), so getting back to upright/sideways is
  // easy. Pivots around the viewport centre so the canvas doesn't jump.
  const snapRotation = () => setView((v) => {
    const step = Math.PI / 2
    const snapped = Math.round((v.rot || 0) / step) * step
    if (Math.abs((v.rot || 0) - snapped) >= 0.12) return v
    const px = viewport.w / 2
    const py = viewport.h / 2
    const d = screenToDoc(px, py, v)
    const c = Math.cos(snapped)
    const s = Math.sin(snapped)
    return { ...v, rot: snapped, tx: px - v.scale * (c * d.x - s * d.y), ty: py - v.scale * (s * d.x + c * d.y) }
  })

  const liftTouch = (e, { allowTap }) => {
    const wasPinch = touchPts.current.size === 2 && !!pinchRef.current
    touchPts.current.delete(e.pointerId)
    if (wasPinch) snapRotation()
    if (touchPts.current.size === 0) {
      const t = tapRef.current
      tapRef.current = null
      pinchRef.current = null
      panning.current = null
      if (allowTap && t && t.valid && !t.moved && Date.now() - t.t0 < 350 && !bgAdjust) {
        if (t.maxN === 2) undo()
        else if (t.maxN === 3) redo()
      }
    } else {
      startPinchIfTwo()
      panning.current = null
    }
  }

  const onPointerUp = (e) => {
    if (e.pointerType === 'touch') return liftTouch(e, { allowTap: true })
    endDrag()
  }
  const onPointerCancel = (e) => {
    if (e.pointerType === 'touch') {
      if (tapRef.current) tapRef.current.valid = false
      return liftTouch(e, { allowTap: false })
    }
    endDrag()
  }

  // iOS Safari fires proprietary gesture events for pinches; kill them so the
  // PAGE never zooms — only our canvas transform does. touch-action:none on the
  // canvas covers pointer defaults; this covers the rest.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prevent = (e) => e.preventDefault()
    canvas.addEventListener('gesturestart', prevent)
    canvas.addEventListener('gesturechange', prevent)
    canvas.addEventListener('gestureend', prevent)
    return () => {
      canvas.removeEventListener('gesturestart', prevent)
      canvas.removeEventListener('gesturechange', prevent)
      canvas.removeEventListener('gestureend', prevent)
    }
  }, [])

  // ---- drag a colour swatch onto the canvas to flood-fill --------------------
  // Pointer-based, NOT HTML5 drag-and-drop: iPad Safari has no touch DnD, so
  // one pointer path serves finger, pencil and mouse. A small ghost swatch
  // follows the pointer; a quick tap (no movement) just picks the colour.
  // nearestBead lets a drop in a gap still fill the closest bead's region.
  const swatchDrag = useRef(null) // { color, x0, y0, active }
  const [dragGhost, setDragGhost] = useState(null) // { color, x, y } client coords

  const onSwatchDown = (c) => (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    swatchDrag.current = { color: c, x0: e.clientX, y0: e.clientY, active: false }
  }
  const onSwatchMove = (e) => {
    const d = swatchDrag.current
    if (!d) return
    if (!d.active && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8) d.active = true
    if (d.active) setDragGhost({ color: d.color, x: e.clientX, y: e.clientY })
  }
  const onSwatchUp = (e) => {
    const d = swatchDrag.current
    swatchDrag.current = null
    setDragGhost(null)
    if (!d) return
    if (!d.active) {
      setColor(d.color) // tap = pick the colour
      return
    }
    const rect = canvasRef.current.getBoundingClientRect()
    if (
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom
    ) {
      const { x, y } = screenToDoc(e.clientX - rect.left, e.clientY - rect.top, view)
      pushRecent(d.color)
      floodFill(tech.nearestBead(geo, x, y), d.color)
    }
  }
  const onSwatchCancel = () => {
    swatchDrag.current = null
    setDragGhost(null)
  }

  // ---- background image upload ----
  const onBgImage = (file) => {
    if (!file) return
    // Read as a DATA URL (not a blob URL): data URLs survive save/reload, so the
    // reference image is stored in the artwork and comes back when reopened.
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const img = new Image()
      img.onload = () => {
        bgImgRef.current = img
        setBg((b) => ({ ...b, type: 'image', image: dataUrl }))
        setBgT({ x: 0, y: 0, scale: 1 })
        setBgShown(true)
        setBgAdjust(true) // go straight into placing the reference design
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  // ---- export (print-ready chart: outlined beads + guides + numbers + legend) ----
  const chartBackground = () => {
    if (exportBg === 'transparent') return { type: 'transparent' }
    if (bg.type === 'image') {
      // a hidden image exports as the solid colour, same as on screen
      if (!bgShown || !bgImgRef.current) return { type: 'solid', color: bg.color }
      // pass the placement as FRACTIONS of the doc size so the chart (which
      // rasterises at a different pixel scale) reproduces the same alignment
      return {
        type: 'image',
        img: bgImgRef.current,
        t: { scale: bgT.scale, fx: bgT.x / geo.width, fy: bgT.y / geo.height },
      }
    }
    return bg
  }

  // flatten the VISIBLE layers top-down into one Map — the single chart the
  // artisan reads. Iterating bottom→top means the top layer's bead wins.
  const flattenVisible = () => {
    const m = new Map()
    for (const l of layersRef.current) {
      if (!layerVisible(l, groupsRef.current)) continue
      for (const [k, v] of l.beads) m.set(k, v)
    }
    return m
  }

  const exportPNG = () => {
    const flat = flattenVisible()
    const chart = renderFullChart({
      beads: flat,
      cols,
      rows,
      tiltFor,
      tech,
      printBeadMm,
      beadRatio,
      background: chartBackground(),
    })
    const legend = renderLegend(flat)
    const gap = 24
    const out = document.createElement('canvas')
    // stacking chart + legend can exceed the browser canvas ceiling even when
    // the chart alone fits — past it drawing silently no-ops and the PNG saves
    // blank. Shrink the composite to stay inside (see rasterScale in chart.js).
    const outW = Math.max(chart.width, legend.width)
    const outH = chart.height + gap + legend.height
    const s = rasterScale(outW, outH)
    out.width = Math.ceil(outW * s)
    out.height = Math.ceil(outH * s)
    const ctx = out.getContext('2d')
    ctx.scale(s, s)
    if (exportBg !== 'transparent') {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, outW, outH)
    }
    ctx.drawImage(chart, 0, 0)
    ctx.drawImage(legend, 0, chart.height + gap)
    const link = document.createElement('a')
    link.download = 'beadwork-chart.png'
    link.href = out.toDataURL('image/png')
    link.click()
  }

  // no confirm dialog: triggered by a press-and-hold button, and undo-able.
  // Clears the ACTIVE layer only (other layers are untouched, Procreate-style).
  const clearCanvas = () => {
    if (!canEdit) return
    commit((prev) => (prev.size ? new Map() : prev))
  }

  // ---- artworks: each design is its own IndexedDB record; one open at a time ----
  const [designName, setDesignName] = useState('') // the open artwork's name
  const [screen, setScreen] = useState('loading') // 'loading' | 'gallery' | 'editor'
  const [artworks, setArtworks] = useState([]) // lightweight gallery summaries
  const [currentArtworkId, setCurrentArtworkId] = useState(null)

  // ---- gallery card long-press menu (Rename/Duplicate/Delete) ----
  // Tap opens the artwork; a ~450ms hold (or right-click on desktop) opens a
  // floating menu instead — Procreate-style, matches the beadwork tool's
  // dashboard so gallery cards stay clean (no always-visible action buttons).
  const [artMenu, setArtMenu] = useState(null) // { id, x, y } | null
  const longPressTimer = useRef(0)
  const longPressFired = useRef(false)
  const longPressStart = useRef({ x: 0, y: 0 })
  const LONG_PRESS_MS = 450
  const LONG_PRESS_CANCEL_PX = 10

  const onCardPointerDown = (id, e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    longPressFired.current = false
    longPressStart.current = { x: e.clientX, y: e.clientY }
    clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setArtMenu({ id, x: e.clientX, y: e.clientY })
    }, LONG_PRESS_MS)
  }
  const onCardPointerMove = (e) => {
    const dx = e.clientX - longPressStart.current.x
    const dy = e.clientY - longPressStart.current.y
    if (Math.hypot(dx, dy) > LONG_PRESS_CANCEL_PX) clearTimeout(longPressTimer.current)
  }
  const onCardPointerUp = () => clearTimeout(longPressTimer.current)
  const onCardContextMenu = (id, e) => {
    e.preventDefault()
    clearTimeout(longPressTimer.current)
    setArtMenu({ id, x: e.clientX, y: e.clientY })
  }
  const onCardClick = (id) => {
    // a long-press just opened the menu for this card — don't also navigate
    if (longPressFired.current) { longPressFired.current = false; return }
    openArtwork(id)
  }

  // close the card menu on any outside pointerdown
  useEffect(() => {
    if (!artMenu) return
    const onDown = (e) => { if (!e.target.closest?.('.artMenu')) setArtMenu(null) }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [artMenu])

  // one design = one plain object: this is what every save path (quick-save,
  // named slot, exported file) writes and what applyDesign reads back
  const designData = () => ({
    version: 3, name: designName, technique: techniqueId, canvasCm, beadMM, palette, bg, bgT, bgShown, pack,
    groups: (groupsRef.current || []).map((g) => ({
      id: g.id, name: g.name, visible: g.visible, locked: g.locked, collapsed: g.collapsed,
    })),
    layers: layersRef.current.map((l) => ({
      name: l.name, visible: l.visible, locked: l.locked, groupId: l.groupId || null, beads: [...l.beads.entries()],
    })),
    activeIndex: Math.max(0, layersRef.current.findIndex((l) => l.id === activeIdRef.current)),
  })

  // Apply a design object from any source (browser storage, a named slot, an
  // imported file). undoable: loading over current work goes on the undo stack;
  // the boot-time restore doesn't (there is nothing to go back to).
  const applyDesign = (d, { undoable = false } = {}) => {
    if (!d || typeof d !== 'object' || (!Array.isArray(d.beads) && !Array.isArray(d.layers)))
      return false
    // technique tag: older saves predate it and were all 3-bead (getTechnique
    // falls back to 3-bead for a missing/unknown id)
    setTechniqueId(getTechnique(d.technique).id)
    if (d.canvasCm) setCanvasCm(d.canvasCm)
    // snap to the nearest offered size (older saves may hold removed sizes)
    if (d.beadMM) {
      const s = BEAD_SIZES.reduce((a, b) =>
        Math.abs(b.w - d.beadMM.w) < Math.abs(a.w - d.beadMM.w) ? b : a
      )
      setBeadMM({ w: s.w, h: s.h })
    }
    if (Array.isArray(d.palette)) setPalette(d.palette)
    // older saves may hold the removed on-screen transparent background
    if (d.bg) setBg(d.bg.type === 'transparent' ? { ...d.bg, type: 'solid' } : d.bg)
    // restore (or clear) the reference image: data-URL bg images are reloaded
    // into bgImgRef so they draw; switching to a design without one clears the
    // previous artwork's image so it can't linger on the canvas
    if (d.bg && d.bg.type === 'image' && d.bg.image) {
      const img = new Image()
      img.onload = () => { bgImgRef.current = img; requestRedraw() }
      img.src = d.bg.image
    } else {
      bgImgRef.current = null
    }
    if (d.bgT) setBgT(d.bgT)
    if (typeof d.bgShown === 'boolean') setBgShown(d.bgShown)
    if (typeof d.pack === 'number') setPack(clampNum(d.pack, 0, 1))
    // older saves stored the Packed/Spaced toggle as a boolean; packed meant
    // the 1.15× touching look, which is 0.75 on today's wider slider
    else if (typeof d.packed === 'boolean') setPack(d.packed ? 0.75 : 0)
    if (typeof d.name === 'string') setDesignName(d.name)
    // Build the layer stack: new saves carry `layers`; older single-Map saves
    // and files migrate into one layer.
    let nl = null
    let activeIndex = 0
    if (Array.isArray(d.layers) && d.layers.length) {
      nl = d.layers.map((l) =>
        makeLayer(
          typeof l.name === 'string' ? l.name : 'Layer',
          new Map(Array.isArray(l.beads) ? l.beads : [])
        )
      )
      d.layers.forEach((l, i) => {
        nl[i].visible = l.visible !== false
        nl[i].locked = !!l.locked
        if (l.groupId) nl[i].groupId = l.groupId
      })
      activeIndex = clampNum(d.activeIndex || 0, 0, nl.length - 1)
    } else if (Array.isArray(d.beads)) {
      nl = [makeLayer('Layer 1', new Map(d.beads))]
    }
    if (!nl) return false
    // groups: keep only ones an actual layer still references (dangling ids
    // dropped — e.g. a hand-edited or older/corrupt file); pre-v3 saves have
    // no groups field at all and load with none, same as a fresh artwork.
    const validGroupIds = new Set(nl.filter((l) => l.groupId).map((l) => l.groupId))
    const ng = Array.isArray(d.groups)
      ? d.groups
          .filter((g) => g && validGroupIds.has(g.id))
          .map((g) => ({
            id: g.id, name: g.name || 'Group',
            visible: g.visible !== false, locked: !!g.locked, collapsed: !!g.collapsed,
          }))
      : []
    if (undoable) pushHistory(currentDoc())
    const active = nl[activeIndex] || nl[0]
    layersRef.current = nl
    groupsRef.current = ng
    activeIdRef.current = active.id
    beadsRef.current = active.beads
    patternBaseRef.current = null
    setLayers(nl)
    setGroups(ng)
    setActiveId(active.id)
    setBeads(active.beads)
    setSelection(new Set())
    setPlacing(null)
    return true
  }

  // lightweight gallery row (the full design stays in IndexedDB, not in state)
  const summarize = (rec) => {
    const t = getTechnique(rec.technique)
    return {
      id: rec.id,
      name: rec.name || 'Untitled',
      technique: t.label,
      beads: (rec.layers || []).reduce((n, l) => n + (l.beads ? l.beads.length : 0), 0),
      updatedAt: rec.updatedAt || 0,
      thumb: rec.thumb || null,
    }
  }

  // Small flat-colour preview PNG for the gallery card, generated from a
  // design record (works on any rec: the live open artwork's autosave, an
  // imported file, a duplicate — anything with layers/canvasCm/beadMM/
  // technique). Iterates only PLACED beads (sparse, top-wins across visible
  // layers), not the whole grid, so it stays cheap on a dense design.
  const THUMB_W = 240
  const THUMB_H = 168
  const makeThumb = (rec) => {
    try {
      const t = getTechnique(rec.technique)
      const { cols: tc, rows: tr } = t.beadCountFromCm({
        canvasWcm: rec.canvasCm.w, canvasHcm: rec.canvasCm.h,
        beadWmm: rec.beadMM.w, beadHmm: rec.beadMM.h,
      })
      if (!tc || !tr) return null
      const merged = new Map()
      for (const l of rec.layers || []) {
        if (l.visible === false) continue
        for (const [k, v] of l.beads || []) merged.set(k, v)
      }
      const canvas = document.createElement('canvas')
      canvas.width = THUMB_W
      canvas.height = THUMB_H
      const ctx = canvas.getContext('2d')
      const s = Math.min(THUMB_W / tc, THUMB_H / tr)
      const ox = (THUMB_W - tc * s) / 2
      const oy = (THUMB_H - tr * s) / 2
      ctx.fillStyle = (rec.bg && rec.bg.type === 'solid' && rec.bg.color) || '#FFFFFF'
      ctx.fillRect(ox, oy, tc * s, tr * s)
      const cell = Math.max(1, Math.ceil(s))
      for (const [k, v] of merged) {
        const [c, r] = k.split(',').map(Number)
        ctx.fillStyle = decodeBead(v).color
        ctx.fillRect(ox + c * s, oy + r * s, cell, cell)
      }
      return canvas.toDataURL('image/png')
    } catch {
      return null
    }
  }

  // Blank the canvas for a fresh artwork in `techId`. Layers/history/selection
  // reset; the background resets to plain so a previous artwork's reference
  // image can't linger. Canvas size, bead size, palette and spacing carry over.
  const resetDesign = (techId) => {
    setTechniqueId(techId)
    const l = makeLayer('Layer 1')
    layersRef.current = [l]
    groupsRef.current = []
    activeIdRef.current = l.id
    beadsRef.current = l.beads
    patternBaseRef.current = null
    undoStack.current = []
    redoStack.current = []
    setLayers([l])
    setGroups([])
    setActiveId(l.id)
    setBeads(l.beads)
    setSelection(new Set())
    setPlacing(null)
    setBg({ type: 'solid', color: '#FFFFFF', image: null })
    bgImgRef.current = null
    setBgT({ x: 0, y: 0, scale: 1 })
    setBgShown(true)
    setBgAdjust(false)
  }

  // Create + open a new artwork. Auto-named from the forest. Persisted
  // immediately so it appears in the gallery before the first edit; auto-save
  // keeps it current after.
  const createArtwork = (techId) => {
    resetDesign(techId)
    const id = uid()
    const name = nextTreeName(artworks.map((a) => a.name))
    setDesignName(name)
    setCurrentArtworkId(id)
    setScreen('editor')
    const rec = {
      id, updatedAt: Date.now(), version: 2, name, technique: techId,
      canvasCm, beadMM, palette, pack,
      bg: { type: 'solid', color: '#FFFFFF', image: null },
      bgT: { x: 0, y: 0, scale: 1 }, bgShown: true,
      layers: [{ name: 'Layer 1', visible: true, locked: false, beads: [] }],
      activeIndex: 0,
    }
    putArtwork(rec).catch(() => {})
    setArtworks((a) => [...a, summarize(rec)])
    setMeta('lastOpenedId', id).catch(() => {})
  }

  // Open an existing artwork into the editor. Undo history doesn't cross
  // artworks, so it's cleared.
  const openArtwork = async (id) => {
    const rec = await getArtwork(id)
    if (!rec || !applyDesign(rec)) return
    undoStack.current = []
    redoStack.current = []
    setCurrentArtworkId(id)
    setScreen('editor')
    setMeta('lastOpenedId', id).catch(() => {})
  }

  const renameArtwork = async (id, raw) => {
    const name = (raw || '').trim()
    if (!name) return
    const rec = await getArtwork(id)
    if (!rec) return
    rec.name = name
    rec.updatedAt = Date.now()
    await putArtwork(rec)
    setArtworks((a) => a.map((x) => (x.id === id ? { ...x, name } : x)))
    if (id === currentArtworkId) setDesignName(name)
  }

  const duplicateArtwork = async (id) => {
    const rec = await getArtwork(id)
    if (!rec) return
    const copy = { ...rec, id: uid(), name: `${rec.name || 'Untitled'} copy`, updatedAt: Date.now() }
    await putArtwork(copy)
    setArtworks((a) => [...a, summarize(copy)])
  }

  const removeArtwork = async (id) => {
    if (!window.confirm('Delete this artwork? This cannot be undone.')) return
    await dbDeleteArtwork(id)
    setArtworks((a) => a.filter((x) => x.id !== id))
    if (id === currentArtworkId) {
      setCurrentArtworkId(null)
      setScreen('gallery')
    }
  }

  // ---- design files (move/back up between devices) ----
  // Export the OPEN artwork as a single <name>.beadwork.json.
  const exportDesignFile = () => {
    const name = designName.trim() || 'beadwork-design'
    const blob = new Blob([JSON.stringify(designData())], { type: 'application/json' })
    const link = document.createElement('a')
    link.download = `${name}.beadwork.json`
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // Export EVERY artwork to one backup file.
  const exportAllArtworks = async () => {
    const all = await listArtworks()
    const blob = new Blob(
      [JSON.stringify({ version: 2, kind: 'beadwork-backup', artworks: all })],
      { type: 'application/json' }
    )
    const link = document.createElement('a')
    link.download = `beadwork-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const isDesign = (d) => d && typeof d === 'object' && (Array.isArray(d.layers) || Array.isArray(d.beads))

  // Import a file: a single design becomes a new artwork (and opens); a backup
  // file ("Export all") restores all its artworks into the gallery.
  const onDesignFile = async (file) => {
    if (!file) return
    try {
      const d = JSON.parse(await file.text())
      if (d && d.kind === 'beadwork-backup' && Array.isArray(d.artworks)) {
        for (const a of d.artworks) {
          if (isDesign(a)) {
            const rec = { ...a, id: uid(), updatedAt: a.updatedAt || Date.now() }
            rec.thumb = a.thumb || makeThumb(rec)
            await putArtwork(rec)
          }
        }
        const all = await listArtworks()
        setArtworks(all.map(summarize))
        setScreen('gallery')
        return
      }
      if (!isDesign(d)) throw new Error('not a design')
      const id = uid()
      const name =
        (typeof d.name === 'string' && d.name) ||
        file.name.replace(/(\.beadwork)?\.json$/i, '') ||
        nextTreeName(artworks.map((a) => a.name))
      const rec = { id, updatedAt: Date.now(), ...d, name }
      rec.thumb = rec.thumb || makeThumb(rec)
      await putArtwork(rec)
      setArtworks((a) => [...a, summarize(rec)])
      openArtwork(id)
    } catch (e) {
      window.alert('Could not read that file — it does not look like a beadwork design or backup file.')
    }
  }

  // ---- auto-save: the open artwork persists itself (debounced) ----
  // React state (incl. `layers`) is the trigger, so silent pencil strokes are
  // caught at stroke end when setLayers runs. designData() reads the live refs.
  const saveTimer = useRef(0)
  useEffect(() => {
    if (screen !== 'editor' || !currentArtworkId) return
    clearTimeout(saveTimer.current)
    // Scale the debounce with design size — serialising every layer's beads on
    // every settle is cheap for a small design but adds up on a dense one.
    let n = 0
    for (const l of layers) n += l.beads.size
    const delay = n > 40000 ? 4000 : n > 15000 ? 1800 : 600
    saveTimer.current = setTimeout(() => {
      const rec = { id: currentArtworkId, updatedAt: Date.now(), ...designData() }
      rec.thumb = makeThumb(rec)
      putArtwork(rec)
        .then(() => setArtworks((a) => a.map((x) => (x.id === rec.id ? summarize(rec) : x))))
        .catch(() => {})
    }, delay)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, currentArtworkId, layers, canvasCm, beadMM, palette, bg, bgT, bgShown, pack, designName, techniqueId])

  // ---- one-time migration of the old localStorage designs into IndexedDB ----
  const migrateFromLocalStorage = async () => {
    if (await getMeta('migrated')) return
    const recs = []
    try {
      const list = JSON.parse(localStorage.getItem(DESIGNS_KEY) || 'null')
      if (Array.isArray(list)) {
        for (const slot of list) {
          if (slot && isDesign(slot.data)) {
            recs.push({ id: uid(), updatedAt: slot.savedAt || Date.now(), ...slot.data, name: slot.name || slot.data.name || 'Untitled' })
          }
        }
      }
    } catch (e) {}
    try {
      const d = JSON.parse(localStorage.getItem(DESIGN_KEY) || 'null')
      // the quick-save, unless it's already one of the named slots above
      if (isDesign(d) && !recs.some((r) => JSON.stringify(r.layers) === JSON.stringify(d.layers))) {
        recs.push({ id: uid(), updatedAt: Date.now(), ...d, name: d.name || 'Untitled' })
      }
    } catch (e) {}
    for (const r of recs) await putArtwork(r)
    await setMeta('migrated', true)
  }

  // ---- boot: migrate, then reopen the last-edited artwork (or show the gallery) ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await migrateFromLocalStorage()
        const all = await listArtworks()
        if (cancelled) return
        setArtworks(all.map(summarize))
        if (!all.length) { setScreen('gallery'); return }
        const lastId = await getMeta('lastOpenedId')
        const last =
          all.find((a) => a.id === lastId) ||
          all.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
        if (cancelled) return
        applyDesign(last)
        undoStack.current = []
        redoStack.current = []
        setCurrentArtworkId(last.id)
        setScreen('editor')
      } catch (e) {
        if (!cancelled) setScreen('gallery')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- UI ----

  return (
    <div className="app">
      {/* LEFT panel — tools & document. Scrolls; hold-to-clear pinned at the bottom. */}
      <aside className="panel left">
        <div className="panelScroll">
        <div className="brand">CROSS STITCH<span className="dot" /></div>
        <div className="sub">{tech.subtitle}</div>

        {!canEdit && (
          <div className="lockNote">
            {activeLayer && !activeLayer.visible ? 'Active layer is hidden' : 'Active layer is locked'}
            {' '}— drawing is off.
          </div>
        )}

        {tool !== 'select' && (
          <div className="brushRow">
            <span className="brushLabel">Brush</span>
            <input
              className="slider"
              type="range"
              min="1"
              max="6"
              step="1"
              value={brush}
              onChange={(e) => setBrush(+e.target.value)}
            />
            <span className="brushVal">{brush}</span>
          </div>
        )}

        {tool !== 'select' && (
          <div className="brushRow">
            <span className="brushLabel">Stitch</span>
            <div className="segmented stitchSeg">
              {[
                ['cross', '✕ Cross', 'Full cross stitch'],
                ['line', '╱ Line', 'Single diagonal-line stitch'],
                ['lineFlip', '╲ Flip', 'Single line stitch, flipped to the other diagonal'],
              ].map(([id, label, hint]) => (
                <button
                  key={id}
                  className={`seg ${stitchStyle === id ? 'on' : ''}`}
                  onClick={() => setStitchStyle(id)}
                  title={hint}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(tool === 'select' || selection.size > 0 || placing) && (
          <div className="card selCard">
            <div className="cardTitle">Selection · {selection.size}</div>
            <div className="pillRow">
              <button className="ghost" onClick={recolorSelection} disabled={!selection.size || !canEdit}>Recolour</button>
              <button className="ghost" onClick={deleteSelection} disabled={!selection.size || !canEdit}>Delete</button>
            </div>
            {!placing && (
              <div className="pillRow">
                <button className="ghost half" onClick={() => startPlacing('copy')} disabled={!selection.size || !canEdit}>Duplicate</button>
                <button className="ghost half" onClick={() => startPlacing('move')} disabled={!selection.size || !canEdit}>Move</button>
              </div>
            )}
            {placing && (
              <>
                <div className="cardTitle small">{placing.mode === 'move' ? 'Moving selection' : 'Placing copy'}</div>
                <div className="pillRow">
                  <button className="ghost half" onClick={placeMotif} disabled={!canEdit}>Place</button>
                  <button className="ghost half" onClick={() => setPlacing(null)}>Cancel</button>
                </div>
                <div className="hint tip">
                  {placing.mode === 'move'
                    ? 'Drag the faded beads to their new spot, then tap Place. Cancel puts them back.'
                    : 'Drag the faded copy on the canvas, then tap Place. The placed copy stays selected — Duplicate again to keep stamping.'}
                </div>
              </>
            )}
            {selection.size > 0 && <button className="ghost" onClick={clearSelection}>Clear selection</button>}
            <div className="cardTitle small">Pattern maker</div>
            <div className="pillRow">
              <button className="ghost" onClick={() => makePattern('grid')} disabled={!selection.size || !canEdit}>Grid</button>
              <button className="ghost" onClick={() => makePattern('brick')} disabled={!selection.size || !canEdit}>Brick</button>
              <button className="ghost" onClick={() => makePattern('halfdrop')} disabled={!selection.size || !canEdit}>½ drop</button>
            </div>
            <Pill
              value={patternGap}
              label="gap beads"
              onChange={(v) => setPatternGap(clampNum(Math.round(v), 0, 60))}
            />
            <div className="hint tip">
              Drag a box over coloured beads to select a motif, then repeat it
              across the whole canvas. Gap = empty beads between repeats.
              Undo removes the pattern.
            </div>
          </div>
        )}

        <div className="hint tip">Drag a palette colour onto the canvas to fill a region.</div>

        <div className="card">
          <div className="cardTitle">Canvas size</div>
          <div className="pillRow">
            <Pill value={canvasCm.w} label="cm W" onChange={(v) => setCanvasCm((c) => ({ ...c, w: clampNum(v, 1, 300) }))} />
            <Pill value={canvasCm.h} label="cm H" onChange={(v) => setCanvasCm((c) => ({ ...c, h: clampNum(v, 1, 300) }))} />
          </div>
          <div className="hint">≈ {cols} × {rows} stitches · pinch / scroll to zoom · finger / space-drag to pan · 2-finger tap undo · 3-finger tap redo</div>
        </div>

        <div className="card">
          <div className="cardTitle">Fabric colour</div>
          <div className="colorTop">
            <input type="color" value={bg.color} onChange={(e) => setBg((b) => ({ ...b, type: 'solid', color: e.target.value }))} className="bigSwatch" />
            <Pill value={bg.color} label="hex" text onChange={(v) => setBg((b) => ({ ...b, type: 'solid', color: v }))} />
          </div>
          <div className="hint">The fabric the stitches sit on. Default white.</div>
        </div>
        </div>

        <div className="saveCluster">
          <HoldButton onHold={clearCanvas}>Hold to clear canvas</HoldButton>
        </div>
      </aside>

      <main className="stage">
        <div className="pasteboard" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className={`board ${grabbing ? 'grab' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          />
          {/* floating tool strip — right edge, under a right-handed iPad user's
              hand (locked iPad-pass decision #4). Big ≥44px touch targets. */}
          <div className="toolStrip">
            {[
              ['draw', 'Draw', <IconDraw key="d" />],
              ['erase', 'Erase', <IconErase key="e" />],
              ['select', 'Select', <IconSelect key="s" />],
            ].map(([id, label, icon]) => (
              <button
                key={id}
                className={`stripBtn ${tool === id ? 'on' : ''}`}
                onClick={() => setTool(id)}
                title={label}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
            <span className="stripSep" />
            <button
              className={`stripBtn ${showLayers ? 'on' : ''}`}
              onClick={() => setShowLayers((v) => !v)}
              title="Layers"
            >
              <IconLayers />
              <span>Layers</span>
            </button>
          </div>

          {/* floating Procreate-style layers panel (sits left of the tool strip) */}
          {showLayers && (
            <div className="layersPanel">
              <div className="layersHead">
                <span>LAYERS</span>
                <button className="lpAdd" onClick={addLayer} title="New layer">+</button>
              </div>
              <div className="layersList">
                {/* top of the stack shows first (array is bottom→top); contiguous
                    grouped runs render under one collapsible header. Inlined as
                    an IIFE (not a separate outer function) so styled-jsx's
                    scoping transform — which only walks JSX reachable from this
                    return statement — actually applies to these elements. */}
                {(() => {
                  const row = (l, grouped) => {
                    const thumb = layerThumb(l)
                    return (
                      <div
                        key={l.id}
                        className={`layerRow ${l.id === activeId ? 'on' : ''} ${grouped ? 'grouped' : ''}`}
                        onClick={() => switchLayer(l.id)}
                      >
                        <button
                          className="lpEye"
                          onClick={(e) => { e.stopPropagation(); toggleVisible(l.id) }}
                          title={l.visible ? 'Hide layer' : 'Show layer'}
                        >
                          {l.visible ? <IconEye /> : <IconEyeOff />}
                        </button>
                        <div className="lpThumb">
                          {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="lpThumbEmpty" />}
                        </div>
                        <span
                          className="lpName"
                          onDoubleClick={() => {
                            const name = window.prompt('Rename layer:', l.name)
                            if (name !== null) renameLayer(l.id, name.trim() || l.name)
                          }}
                          title="Double-click to rename"
                        >
                          {l.name}
                          {l.locked && <em className="lpLockTag">locked</em>}
                        </span>
                        <span className="lpCount">{l.beads.size}</span>
                        <button
                          className="lpLock"
                          onClick={(e) => { e.stopPropagation(); toggleLock(l.id) }}
                          title={l.locked ? 'Unlock layer' : 'Lock layer'}
                        >
                          {l.locked ? <IconLock /> : <IconUnlock />}
                        </button>
                      </div>
                    )
                  }
                  const topDown = [...layers].reverse()
                  const out = []
                  let i = 0
                  while (i < topDown.length) {
                    const l = topDown[i]
                    if (l.groupId) {
                      const gid = l.groupId
                      const g = groups.find((x) => x.id === gid)
                      const members = []
                      while (i < topDown.length && topDown[i].groupId === gid) { members.push(topDown[i]); i++ }
                      out.push(
                        <div className="groupHeader" key={`g-${gid}`}>
                          <button
                            className="lpChevron"
                            onClick={() => toggleGroupCollapsed(gid)}
                            title={g?.collapsed ? 'Expand group' : 'Collapse group'}
                          >
                            {g?.collapsed ? '▸' : '▾'}
                          </button>
                          <button
                            className="lpEye"
                            onClick={() => toggleGroupVisible(gid)}
                            title={g?.visible === false ? 'Show group' : 'Hide group'}
                          >
                            {g?.visible === false ? <IconEyeOff /> : <IconEye />}
                          </button>
                          <span
                            className="lpName"
                            onDoubleClick={() => {
                              const name = window.prompt('Rename group:', g?.name || 'Group')
                              if (name !== null) renameGroup(gid, name.trim() || (g?.name || 'Group'))
                            }}
                            title="Double-click to rename"
                          >
                            {g?.name || 'Group'}
                            <em className="lpMemberCount"> · {members.length}</em>
                          </span>
                          <button className="lpFlatten" onClick={() => flattenGroup(gid)} title="Flatten group into one layer">Flat</button>
                          <button
                            className="lpLock"
                            onClick={() => toggleGroupLocked(gid)}
                            title={g?.locked ? 'Unlock group' : 'Lock group'}
                          >
                            {g?.locked ? <IconLock /> : <IconUnlock />}
                          </button>
                        </div>
                      )
                      if (!g?.collapsed) for (const m of members) out.push(row(m, true))
                    } else {
                      out.push(row(l, false))
                      i++
                    }
                  }
                  return out
                })()}
              </div>
              <div className="layerActions">
                {(() => {
                  const i = layers.findIndex((l) => l.id === activeId)
                  const al = layers[i]
                  const below = i > 0 ? layers[i - 1] : null
                  const canGroup = !!al && !al.groupId && !!below
                  const canUngroup = !!al?.groupId
                  return (
                    <>
                      <button onClick={() => duplicateLayer(activeId)} title="Duplicate active layer">Dup</button>
                      <button onClick={() => mergeDown(activeId)} disabled={i <= 0} title="Merge active layer down">Merge↓</button>
                      <button onClick={() => groupWithBelow(activeId)} disabled={!canGroup} title="Group with the layer below">Group</button>
                      <button onClick={() => ungroupLayer(activeId)} disabled={!canUngroup} title="Remove from its group">Ungroup</button>
                      <button onClick={() => moveLayer(activeId, 1)} disabled={i >= layers.length - 1 || !!al?.groupId} title="Move up">↑</button>
                      <button onClick={() => moveLayer(activeId, -1)} disabled={i <= 0 || !!al?.groupId} title="Move down">↓</button>
                      <button onClick={() => deleteLayer(activeId)} disabled={layers.length <= 1} title="Delete active layer">Del</button>
                    </>
                  )
                })()}
              </div>
              <div className="lpHint">Top layer wins where beads overlap. Export flattens visible layers.</div>
            </div>
          )}
          {/* image-adjust mode banner */}
          {bgAdjust && (
            <div className="adjustBar">
              <span>ADJUST IMAGE — DRAG TO MOVE · PINCH / SCROLL TO RESIZE</span>
              <button onClick={() => setBgAdjust(false)}>DONE</button>
            </div>
          )}
          <div className="zoomCtl">
            <button onClick={undo} title="Undo — 2-finger tap or Ctrl+Z">↶</button>
            <button onClick={redo} title="Redo — 3-finger tap or Ctrl+Shift+Z">↷</button>
            <span className="zsep" />
            <button onClick={() => zoomAt(1 / 1.2, viewport.w / 2, viewport.h / 2)} title="Zoom out">−</button>
            <button className="zval" onClick={fitView} title="Fit to screen">{Math.round(view.scale * 100)}%</button>
            <button onClick={() => zoomAt(1.2, viewport.w / 2, viewport.h / 2)} title="Zoom in">+</button>
          </div>
        </div>
        <div className="stageInfo">
          {cols} × {rows} STITCHES · {canvasCm.w}×{canvasCm.h} CM · CELL {beadMM.w}×{beadMM.h} MM · {Math.round(view.scale * 100)}%
          {view.rot ? ` · ${(((Math.round(view.rot * 180 / Math.PI) % 360) + 360) % 360)}°` : ''}
        </div>
      </main>

      {/* RIGHT panel — colour & output. Content scrolls; the save cluster stays
          pinned at the bottom so a big palette can't push it away (iPad pass #6). */}
      <aside className="panel right">
        <div className="panelScroll">

        {/* Colour */}
        <div className="card">
          <div className="cardTitle">Colour</div>
          <div className="colorTop">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="bigSwatch"
            />
            <Pill value={color} label="hex" text onChange={(v) => setColor(v)} />
          </div>
          {recentColors.length > 0 && (
            <>
              <div className="cardTitle small">Recent</div>
              <div className="swatches">
                {recentColors.map((c, i) => (
                  <button
                    key={i}
                    className={`sw ${c === color ? 'on' : ''}`}
                    style={{ background: c }}
                    onPointerDown={onSwatchDown(c)}
                    onPointerMove={onSwatchMove}
                    onPointerUp={onSwatchUp}
                    onPointerCancel={onSwatchCancel}
                    title={c}
                  />
                ))}
              </div>
            </>
          )}
          <div className="cardTitle small">Palette</div>
          <div className="swatches">
            {palette.map((c, i) => (
              <button
                key={i}
                className={`sw ${c === color ? 'on' : ''}`}
                style={{ background: c }}
                onPointerDown={onSwatchDown(c)}
                onPointerMove={onSwatchMove}
                onPointerUp={onSwatchUp}
                onPointerCancel={onSwatchCancel}
                title={`${c} — tap to pick, drag onto canvas to fill`}
              />
            ))}
            <button
              className="sw add"
              title="Add current colour"
              onClick={() => setPalette((p) => (p.includes(color) ? p : [...p, color]))}
            >+</button>
          </div>
          <button
            className="ghost"
            onClick={() => {
              const name = window.prompt('Name this palette:')
              if (name) persistPalettes([...savedPalettes, { name, colors: palette }])
            }}
          >Save current palette</button>
          {savedPalettes.length > 0 && (
            <>
              <div className="cardTitle small">Saved palettes — click to load</div>
              <div className="savedList">
                {savedPalettes.map((p, i) => (
                  <div className="savedItem" key={i}>
                    <button
                      className="savedApply"
                      onClick={() => setPalette(p.colors)}
                      title={`Load “${p.name}”`}
                    >
                      <span className="savedName">{p.name}</span>
                      <span className="savedSw">
                        {p.colors.slice(0, 12).map((c, j) => (
                          <i key={j} style={{ background: c }} />
                        ))}
                      </span>
                    </button>
                    <button
                      className="x"
                      title="Delete palette"
                      onClick={() => persistPalettes(savedPalettes.filter((_, k) => k !== i))}
                    >×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* This artwork — name + auto-save status + a file to move it elsewhere */}
        <div className="card">
          <div className="cardTitle">This artwork</div>
          <Pill value={designName} label="name" text onChange={setDesignName} />
          <button className="ghost" onClick={() => setScreen('gallery')}>← My artworks</button>
          <button className="ghost" onClick={exportDesignFile}>Export this artwork</button>
          <div className="hint tip">
            Saves itself automatically. Open another, or manage all your artworks,
            from My artworks. Export to back up or move to another device.
          </div>
        </div>

        {/* Export — PNG chart for the artisan */}
        <div className="card">
          <div className="cardTitle">Export — chart PNG</div>
          <div className="segmented">
            {[
              ['transparent', 'Transparent'],
              ['screen', 'On-screen'],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`seg ${exportBg === id ? 'on' : ''}`}
                onClick={() => setExportBg(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="hint">One sheet · outlined beads · numbers + guides every 10 · colour key.</div>
        </div>

        </div>

        <div className="saveCluster">
          <button className="primary" onClick={exportPNG}>Save PNG</button>
          <div className="hint tip">Your work auto-saves. “Save PNG” makes the printable chart for the artisan.</div>
        </div>
      </aside>

      {/* floating swatch that follows the pointer while dragging a colour */}
      {dragGhost && (
        <div
          className="dragGhost"
          style={{ left: dragGhost.x, top: dragGhost.y, background: dragGhost.color }}
        />
      )}

      {/* My artworks gallery — covers the editor when not editing. Loading state
          while the boot read of IndexedDB resolves. */}
      {screen !== 'editor' && (
        <div className="galleryScrim">
          {screen === 'loading' ? (
            <div className="galleryLoading">Loading your artworks…</div>
          ) : (
            <div className="gallery">
              <div className="galleryHead">
                <div className="brand big">MY ARTWORKS<span className="dot" /></div>
                <button className="primary newBtn" onClick={() => createArtwork(DEFAULT_TECHNIQUE)}>+ New artwork</button>
              </div>
              {artworks.length === 0 ? (
                <div className="galleryEmpty">
                  No artworks yet. Tap <b>+ New artwork</b> to plant your first one.
                </div>
              ) : (
                <div className="galleryGrid">
                  {[...artworks]
                    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                    .map((a) => (
                      <div
                        className="artCard"
                        key={a.id}
                        title={`${a.name} — hold or right-click for options`}
                        onPointerDown={(e) => onCardPointerDown(a.id, e)}
                        onPointerMove={onCardPointerMove}
                        onPointerUp={onCardPointerUp}
                        onPointerLeave={onCardPointerUp}
                        onContextMenu={(e) => onCardContextMenu(a.id, e)}
                        onClick={() => onCardClick(a.id)}
                      >
                        <div className="artThumb">
                          {a.thumb ? (
                            <img src={a.thumb} alt="" draggable={false} />
                          ) : (
                            <span className="artMono">{(a.name || '?')[0].toUpperCase()}</span>
                          )}
                        </div>
                        <div className="artCardFoot">
                          <span className="artName">{a.name}</span>
                          <span className="artMeta">{a.beads} · {timeAgo(a.updatedAt)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              {artMenu && (() => {
                const a = artworks.find((x) => x.id === artMenu.id)
                if (!a) return null
                return (
                  <div
                    className="artMenu"
                    style={{ left: Math.min(artMenu.x, window.innerWidth - 160), top: Math.min(artMenu.y, window.innerHeight - 140) }}
                  >
                    <button onClick={() => { setArtMenu(null); openArtwork(a.id) }}>Open</button>
                    <button onClick={() => { setArtMenu(null); const n = window.prompt('Rename artwork:', a.name); if (n !== null) renameArtwork(a.id, n) }}>Rename</button>
                    <button onClick={() => { setArtMenu(null); duplicateArtwork(a.id) }}>Duplicate</button>
                    <button className="del" onClick={() => { setArtMenu(null); removeArtwork(a.id) }}>Delete</button>
                  </div>
                )
              })()}
              <div className="galleryFoot">
                <label className="ghost fileBtn half">
                  Import file / backup
                  <input
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => { onDesignFile(e.target.files[0]); e.target.value = '' }}
                  />
                </label>
                <button className="ghost half" onClick={exportAllArtworks} disabled={!artworks.length}>Back up all</button>
              </div>
              <div className="hint tip galleryHint">
                Artworks are saved in this browser. “Back up all” keeps a safety
                copy you can re-import here or on another device.
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx global>{`
        html, body, #root { height: 100%; margin: 0; }
        body {
          background: ${T.bg};
          color: ${T.ink};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir,
            Helvetica, sans-serif;
          /* iPad: no rubber-band scroll, no double-tap zoom, no text selection
             while drawing — the canvas owns all touch gestures */
          overscroll-behavior: none;
          touch-action: manipulation;
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        * { box-sizing: border-box; }
      `}</style>

      <style jsx>{`
        /* 100dvh = the REAL visible height on iPad Safari (100vh hides behind
           the browser chrome and cut off the bottom buttons) */
        .app { display: flex; height: 100vh; height: 100dvh; overflow: hidden; }

        /* floating swatch following the pointer during a colour drag */
        .dragGhost {
          position: fixed; z-index: 40; width: 30px; height: 30px;
          border-radius: 10px; pointer-events: none;
          transform: translate(-50%, -130%);
          border: 2px solid #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.45);
        }
        .stage {
          flex: 1; display: flex; flex-direction: column;
          min-width: 0; min-height: 0;
        }
        /* fixed Figma/Photoshop-style pasteboard: fills the work area, no
           scrollbars. The viewport-sized canvas fills it; pan/zoom is a transform. */
        .pasteboard {
          position: relative; flex: 1; min-height: 0; overflow: hidden;
          background: #161618;
        }
        .board { display: block; touch-action: none; cursor: crosshair; }
        .board.grab { cursor: grab; }
        .zoomCtl {
          position: absolute; left: 14px; bottom: 14px;
          display: flex; align-items: center; gap: 2px;
          background: ${T.panelSolid};
          border-radius: 14px; padding: 4px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .zoomCtl button {
          border: none; background: none; color: ${T.ink}; cursor: pointer;
          font-family: ${T.mono}; font-size: 14px; width: 30px; height: 26px;
          border-radius: 4px;
        }
        .zoomCtl button:hover { background: #34343a; }
        .zoomCtl .zval { width: 54px; font-size: 11px; }
        .zsep { width: 1px; height: 18px; background: ${T.line}; margin: 0 3px; }

        /* image-adjust mode banner */
        .adjustBar {
          position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 12px;
          background: ${T.panelSolid}; border: 1px solid ${T.accent};
          border-radius: ${T.radius}px; padding: 8px 12px;
          font-family: ${T.mono}; font-size: 9px; letter-spacing: 0.08em;
          color: ${T.ink}; white-space: nowrap;
        }
        .adjustBar button {
          border: none; background: ${T.accent}; color: #fff; cursor: pointer;
          font-family: ${T.mono}; font-size: 10px; font-weight: 700;
          letter-spacing: 0.08em; padding: 6px 14px; border-radius: 4px;
        }

        /* floating Draw/Erase/Select strip — right edge, ≥44px touch targets */
        .toolStrip {
          position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
          display: flex; flex-direction: column; gap: 5px;
          background: ${T.panelSolid};
          border-radius: 18px; padding: 6px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .stripBtn {
          width: 56px; height: 56px;
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 4px;
          border: none; background: none; color: ${T.inkSoft};
          border-radius: 5px; cursor: pointer;
          font-family: ${T.mono}; font-size: 8px; text-transform: uppercase;
          letter-spacing: 0.08em; transition: all 0.12s;
        }
        .stripBtn:hover { color: ${T.ink}; background: #34343a; }
        .stripBtn.on {
          color: ${T.ink}; background: #2f2f35;
          box-shadow: inset 0 0 0 1px ${T.accent};
        }
        .stripBtn.on svg { color: ${T.accent}; }
        .stripSep { height: 1px; background: ${T.line}; margin: 3px 6px; }

        /* floating Procreate-style layers panel */
        .layersPanel {
          position: absolute; right: 84px; top: 50%; transform: translateY(-50%);
          width: 260px; max-height: 78%;
          display: flex; flex-direction: column;
          background: ${T.panelSolid};
          border-radius: 18px; padding: 10px;
          box-shadow: 0 12px 34px rgba(0,0,0,0.5); z-index: 20;
        }
        .layersHead {
          display: flex; align-items: center; justify-content: space-between;
          font-family: ${T.mono}; font-size: 10px; letter-spacing: 0.12em;
          color: ${T.inkSoft}; padding: 2px 4px 8px;
        }
        .lpAdd {
          border: none; background: ${T.pill}; color: ${T.ink}; cursor: pointer;
          width: 24px; height: 24px; border-radius: 6px; font-size: 17px; line-height: 1;
        }
        .lpAdd:hover { background: #34343a; }
        .layersList {
          display: flex; flex-direction: column; gap: 4px;
          overflow-y: auto; -webkit-overflow-scrolling: touch; min-height: 0;
          overscroll-behavior: contain; /* a swipe inside the list must not rubber-band the page behind it */
        }
        .layerRow {
          display: flex; align-items: center; gap: 6px;
          background: ${T.pill}; border-radius: 7px; padding: 7px 8px;
          cursor: pointer; border: 1px solid transparent; transition: background 0.12s;
        }
        .layerRow:hover { background: #34343a; }
        .layerRow.on { border-color: ${T.accent}; background: #2f2f35; }
        .layerRow.grouped { margin-left: 14px; } /* indent under its group header */
        .lpThumb {
          flex-shrink: 0; width: 34px; height: 24px; border-radius: 4px; overflow: hidden;
          background: #ffffff; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
        }
        .lpThumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
        .lpThumbEmpty { display: block; width: 100%; height: 100%; }
        .lpEye, .lpLock, .lpChevron, .lpFlatten {
          flex-shrink: 0; border: none; background: none; cursor: pointer;
          color: ${T.inkSoft}; display: flex; align-items: center; padding: 2px;
        }
        .lpEye:hover, .lpLock:hover, .lpChevron:hover { color: ${T.ink}; }
        .lpName {
          flex: 1; min-width: 0; font-family: ${T.mono}; font-size: 11px;
          color: ${T.ink}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          display: flex; align-items: baseline; gap: 6px;
        }
        .lpLockTag { font-size: 8px; font-style: normal; color: ${T.inkSoft};
          text-transform: uppercase; letter-spacing: 0.08em; }
        .lpCount { flex-shrink: 0; font-family: ${T.mono}; font-size: 9px; color: ${T.inkSoft}; margin-left: 4px; }
        /* collapsible group header — same row language, sits above its members */
        .groupHeader {
          display: flex; align-items: center; gap: 6px;
          background: #232327; border-radius: 7px; padding: 7px 8px;
          border: 1px solid ${T.line};
        }
        .lpChevron { font-size: 11px; width: 14px; justify-content: center; }
        .lpMemberCount { font-size: 9px; font-style: normal; color: ${T.inkSoft}; flex-shrink: 0; }
        .lpFlatten {
          font-family: ${T.mono}; font-size: 8.5px; text-transform: uppercase;
          letter-spacing: 0.04em; padding: 3px 6px; border-radius: 5px; background: ${T.pill};
        }
        .lpFlatten:hover { background: #34343a; color: ${T.ink}; }
        .layerActions {
          display: flex; flex-wrap: wrap; gap: 4px; padding-top: 8px; margin-top: 6px;
          border-top: 1px solid ${T.line};
        }
        .layerActions button {
          flex: 1 1 28%; min-width: 0; border: none; background: ${T.pill}; color: ${T.ink};
          cursor: pointer; border-radius: 6px; padding: 7px 2px;
          font-family: ${T.mono}; font-size: 9px; letter-spacing: 0.02em;
        }
        .layerActions button:hover { background: #34343a; }
        .layerActions button:disabled { opacity: 0.3; cursor: not-allowed; }
        .lpHint { font-family: ${T.mono}; font-size: 8.5px; color: ${T.inkSoft};
          line-height: 1.5; padding: 8px 4px 2px; }

        /* active-layer-not-editable banner (left panel) */
        .lockNote {
          background: #2f2f35; border: 1px solid ${T.accent};
          border-radius: ${T.radius}px; padding: 8px 10px;
          font-family: ${T.mono}; font-size: 9px; letter-spacing: 0.04em;
          color: ${T.ink}; line-height: 1.5;
        }
        .stageInfo {
          flex-shrink: 0; color: ${T.inkSoft}; font-size: 10px; font-family: ${T.mono};
          text-transform: uppercase; letter-spacing: 0.08em;
          padding: 9px 16px; border-top: 1px solid ${T.line}; background: ${T.bg};
        }

        .panel {
          width: 264px; flex-shrink: 0;
          background: ${T.panel};
          padding: 20px 16px; overflow: hidden;
          display: flex; flex-direction: column; gap: 13px;
        }
        .panel.left { border-right: 1px solid ${T.line}; }
        .panel.right { border-left: 1px solid ${T.line}; }
        /* both panels: cards scroll, the pinned cluster below stays visible */
        .panelScroll {
          flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
          -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
          display: flex; flex-direction: column; gap: 11px;
        }
        .saveCluster {
          flex-shrink: 0; display: flex; flex-direction: column; gap: 7px;
          padding-top: 11px; border-top: 1px solid ${T.line};
        }
        .brand {
          font-size: 18px; font-weight: 700; letter-spacing: 0.04em;
          font-family: ${T.mono}; display: inline-flex; align-items: center;
        }
        .dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: ${T.accent}; margin-left: 7px;
        }
        .sub { color: ${T.inkSoft}; font-size: 10px; margin-top: -8px;
          font-family: ${T.mono}; letter-spacing: 0.12em; }

        .tip { color: ${T.inkSoft}; opacity: 0.8; }

        /* brush size slider */
        .brushRow { display: flex; align-items: center; gap: 10px; padding: 2px 2px; }
        .brushLabel { font-family: ${T.mono}; font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.1em; color: ${T.inkSoft}; }
        .brushVal { font-family: ${T.mono}; font-size: 12px; color: ${T.ink}; width: 12px; text-align: right; }
        .stitchSeg { flex: 1; gap: 4px; }
        .stitchSeg.segmented .seg { padding: 8px 2px; font-size: 10px; }
        /* min-width: 0 — a range input refuses to flex-shrink below its ~129px
           built-in size otherwise, which made the left panel scroll sideways */
        .slider { flex: 1; min-width: 0; -webkit-appearance: none; appearance: none; height: 3px;
          background: ${T.line}; border-radius: 3px; outline: none; }
        .slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%; background: ${T.ink}; cursor: pointer; }
        .slider::-moz-range-thumb { width: 14px; height: 14px; border: none; border-radius: 50%;
          background: ${T.ink}; cursor: pointer; }

        /* selection actions */
        .selCard .pillRow { gap: 7px; }
        .ghost:disabled { opacity: 0.35; cursor: not-allowed; }
        .ghost:disabled:hover { background: ${T.pill}; }

        /* accessibility: clear keyboard focus ring on every control */
        .panel button:focus-visible, .panel input:focus-visible,
        .panel label:focus-within { outline: 2px solid ${T.accent}; outline-offset: 1px; }

        .card {
          background: ${T.panelSolid};
          border-radius: 16px;
          padding: 16px; display: flex; flex-direction: column; gap: 11px;
        }
        .cardTitle { font-size: 10px; font-weight: 600; color: ${T.inkSoft};
          font-family: ${T.mono}; text-transform: uppercase; letter-spacing: 0.1em; }
        .cardTitle.small { margin-top: 4px; }
        .hint { font-size: 10px; color: ${T.inkSoft}; font-family: ${T.mono};
          letter-spacing: 0.02em; line-height: 1.5; }

        .segmented { display: flex; gap: 6px; }
        .seg {
          flex: 1; padding: 9px 6px; border: none;
          background: ${T.pill}; color: ${T.ink};
          border-radius: 9px; cursor: pointer; font-size: 13px; font-weight: 600;
          transition: background 0.12s;
        }
        .seg:hover { background: #34343a; }
        .seg.on { background: ${T.active}; color: ${T.activeInk}; }

        .pillRow { display: flex; gap: 8px; }

        .colorTop { display: flex; gap: 10px; align-items: center; }
        .bigSwatch {
          width: 52px; height: 52px; padding: 0; border: 1px solid ${T.line};
          border-radius: 14px; background: none; cursor: pointer;
        }
        .swatches { display: flex; flex-wrap: wrap; gap: 7px; }
        .sw {
          width: 28px; height: 28px; border-radius: 9px; cursor: pointer;
          border: 2px solid transparent; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);
          touch-action: none; /* a finger on a swatch drags colour, not the panel */
        }
        .sw.on { border-color: ${T.ink}; }
        .sw.add {
          background: ${T.pill}; color: ${T.inkSoft}; border: 1px dashed ${T.line};
          font-size: 16px; line-height: 1;
        }
        .savedList { display: flex; flex-direction: column; gap: 5px;
          max-height: 168px; overflow-y: auto; overscroll-behavior: contain; }
        .savedItem { display: flex; align-items: stretch; gap: 4px; }
        .savedApply {
          flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px;
          background: ${T.pill}; border: none; border-radius: 8px; padding: 7px 9px;
          cursor: pointer; text-align: left; transition: background 0.12s;
        }
        .savedApply:hover { background: #34343a; }
        .savedName { font-family: ${T.mono}; font-size: 10px; color: ${T.ink};
          text-transform: uppercase; letter-spacing: 0.06em; }
        .savedSw { display: flex; flex-wrap: wrap; gap: 3px; }
        .savedSw i { width: 14px; height: 14px; border-radius: 3px; display: block;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
        .x { background: none; border: none; color: ${T.inkSoft}; cursor: pointer;
          font-size: 16px; padding: 0 5px; }
        .x:hover { color: ${T.accent}; }

        .ghost, .fileBtn {
          padding: 10px; border: none; background: ${T.pill};
          color: ${T.ink}; border-radius: 10px; cursor: pointer; font-size: 13px;
          font-weight: 600; text-align: center; display: block; transition: background 0.12s;
        }
        .ghost:hover, .fileBtn:hover { background: #34343a; }
        .ghost.half { flex: 1; min-width: 0; }
        .primary {
          padding: 14px; border: none; cursor: pointer;
          background: ${T.accent}; color: #ffffff;
          border-radius: ${T.radius}px; font-size: 12px; font-weight: 700;
          font-family: ${T.mono}; text-transform: uppercase; letter-spacing: 0.1em;
          transition: opacity 0.12s;
        }
        .primary:hover { opacity: 0.88; }

        /* technique chooser modal */
        .modalScrim {
          position: fixed; inset: 0; z-index: 60; display: flex;
          align-items: center; justify-content: center; padding: 24px;
          background: rgba(0,0,0,0.72);
          background-image: radial-gradient(${T.line} 1px, transparent 1px);
          background-size: 16px 16px;
        }
        .modal {
          width: 100%; max-width: 460px; display: flex; flex-direction: column; gap: 14px;
          background: ${T.panelSolid}; border: 1px solid ${T.line};
          border-radius: ${T.radius}px; padding: 22px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
        }
        .modalTitle { font-family: ${T.mono}; font-size: 12px; font-weight: 700;
          letter-spacing: 0.14em; color: ${T.ink};
          display: flex; align-items: center; gap: 8px; }
        .modalTitle::after { content: ''; width: 7px; height: 7px; border-radius: 50%;
          background: ${T.accent}; }
        .modalSub { font-family: ${T.mono}; font-size: 10px; line-height: 1.6;
          color: ${T.inkSoft}; }
        .techGrid { display: flex; gap: 12px; flex-wrap: wrap; }
        .techCard {
          flex: 1; min-width: 160px; text-align: left; cursor: pointer;
          display: flex; flex-direction: column; gap: 7px;
          background: ${T.pill}; border: 1px solid ${T.line};
          border-radius: 10px; padding: 16px; transition: all 0.12s;
        }
        .techCard:hover { background: #34343a; border-color: ${T.inkSoft}; }
        .techCard.on { border-color: ${T.accent}; }
        .techName { font-size: 14px; font-weight: 700; color: ${T.ink}; }
        .techDesc { font-family: ${T.mono}; font-size: 10px; line-height: 1.5; color: ${T.inkSoft}; }

        /* My artworks gallery (covers the editor when not editing) */
        .galleryScrim {
          position: fixed; inset: 0; z-index: 50; display: flex;
          align-items: flex-start; justify-content: center; overflow-y: auto;
          padding: 40px 24px; background: ${T.bg};
        }
        .galleryLoading {
          margin-top: 18vh; font-family: ${T.mono}; font-size: 12px;
          letter-spacing: 0.1em; color: ${T.inkSoft};
        }
        .gallery {
          width: 100%; max-width: 640px; display: flex; flex-direction: column; gap: 16px;
        }
        .galleryHead { display: flex; align-items: center; justify-content: space-between; }
        .brand.big { font-size: 22px; }
        .newBtn { width: auto; padding: 12px 18px; }
        .galleryEmpty {
          font-family: ${T.mono}; font-size: 12px; line-height: 1.7; color: ${T.inkSoft};
          background: ${T.panelSolid}; border: 1px solid ${T.line};
          border-radius: ${T.radius}px; padding: 28px; text-align: center;
        }
        .galleryEmpty b { color: ${T.ink}; }
        /* Procreate-style thumbnail card grid: tap opens, hold/right-click
           opens the artMenu instead of always-visible action buttons */
        .galleryGrid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 14px;
        }
        .artCard {
          display: flex; flex-direction: column; gap: 7px; cursor: pointer;
          -webkit-user-select: none; user-select: none; touch-action: manipulation;
        }
        .artThumb {
          aspect-ratio: 10 / 7; border-radius: 12px; overflow: hidden;
          background: ${T.panelSolid}; border: 1px solid ${T.line};
          display: flex; align-items: center; justify-content: center;
          transition: border-color 0.12s, transform 0.08s;
        }
        .artCard:active .artThumb { transform: scale(0.97); border-color: ${T.accent}; }
        .artThumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
        .artMono {
          font-family: ${T.mono}; font-size: 26px; font-weight: 700; color: ${T.inkSoft};
        }
        .artCardFoot { display: flex; flex-direction: column; gap: 2px; padding: 0 2px; }
        .artName { font-size: 13px; font-weight: 700; color: ${T.ink};
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .artMeta { font-family: ${T.mono}; font-size: 9px; color: ${T.inkSoft};
          text-transform: uppercase; letter-spacing: 0.04em; }
        .galleryFoot { display: flex; gap: 8px; }
        .galleryHint { text-align: center; }

        /* long-press / right-click card menu */
        .artMenu {
          position: fixed; z-index: 70; display: flex; flex-direction: column;
          min-width: 148px; background: ${T.panelSolid}; border: 1px solid ${T.line};
          border-radius: 12px; padding: 5px; box-shadow: 0 12px 34px rgba(0,0,0,0.5);
        }
        .artMenu button {
          border: none; background: none; color: ${T.ink}; cursor: pointer;
          font-family: ${T.mono}; font-size: 11px; text-transform: uppercase;
          letter-spacing: 0.04em; padding: 10px 11px; border-radius: 7px; text-align: left;
        }
        .artMenu button:hover { background: ${T.pill}; }
        .artMenu button.del:hover { color: #fff; background: ${T.accent}; }
      `}</style>
    </div>
  )
}

// inline-labeled input pill (signature look, spec §7.5).
// While focused it edits a local draft string, so the field can be cleared
// to type a fresh number (a clamped controlled input made that impossible);
// the real value only updates on valid input and snaps back on blur.
function Pill({ value, label, onChange, step = 1, text = false }) {
  const [draft, setDraft] = useState(null)
  return (
    <div className="pill">
      <input
        className="pillInput"
        type={text ? 'text' : 'number'}
        value={draft !== null ? draft : value}
        step={step}
        onFocus={() => setDraft(String(value))}
        onChange={(e) => {
          const v = e.target.value
          setDraft(v)
          if (text) {
            onChange(v)
            return
          }
          const n = parseFloat(v)
          if (!Number.isNaN(n)) onChange(n)
        }}
        onBlur={() => setDraft(null)}
      />
      <span className="pillLabel">{label}</span>
      <style jsx>{`
        .pill {
          flex: 1; display: flex; align-items: baseline; gap: 4px;
          background: ${T.pill}; border: none;
          border-radius: ${T.radius}px; padding: 9px 12px; min-width: 0;
        }
        .pillInput {
          border: none; outline: none; width: 100%; min-width: 0;
          font-size: 14px; font-weight: 600; color: ${T.ink}; background: none;
          font-family: ${T.mono}; -moz-appearance: textfield;
        }
        /* remove the number-input spinner / scroll buttons (clean minimal) */
        .pillInput::-webkit-outer-spin-button,
        .pillInput::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .pillLabel { font-size: 9px; color: ${T.inkSoft}; font-weight: 600; flex-shrink: 0;
          font-family: ${T.mono}; text-transform: uppercase; letter-spacing: 0.08em; }
      `}</style>
    </div>
  )
}

// press-and-hold button: the action fires only after `duration` ms of
// continuous press (release/leave cancels). A sweeping fill shows progress —
// no confirm dialog needed, and the action is undo-able anyway.
function HoldButton({ duration = 700, onHold, children }) {
  const timer = useRef(null)
  const [holding, setHolding] = useState(false)
  const start = (e) => {
    e.preventDefault()
    setHolding(true)
    timer.current = setTimeout(() => {
      setHolding(false)
      onHold()
    }, duration)
  }
  const cancel = () => {
    setHolding(false)
    clearTimeout(timer.current)
  }
  return (
    <button
      className={`holdBtn ${holding ? 'holding' : ''}`}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    >
      <span className="holdFill" style={{ transitionDuration: `${duration}ms` }} />
      <span className="holdLabel">{children}</span>
      <style jsx>{`
        .holdBtn {
          position: relative; overflow: hidden; touch-action: none;
          padding: 12px; border: none; background: ${T.pill}; color: ${T.inkSoft};
          border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 600;
          text-align: center; width: 100%; -webkit-user-select: none; user-select: none;
        }
        .holdBtn:hover { color: ${T.ink}; }
        .holdFill {
          position: absolute; inset: 0; background: ${T.accent}; opacity: 0.85;
          transform: scaleX(0); transform-origin: left;
          transition-property: transform; transition-timing-function: linear;
        }
        .holdBtn.holding .holdFill { transform: scaleX(1); }
        .holdBtn.holding .holdLabel { color: #ffffff; }
        .holdLabel { position: relative; }
      `}</style>
    </button>
  )
}

function clampNum(v, lo, hi) {
  if (isNaN(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}
