// IndexedDB-backed store for saved artworks. localStorage (~5MB) can't hold many
// dense, multi-layer designs, so each artwork is its own record in IndexedDB.
// One artwork record = the design object (designData() in App.jsx) plus `id` and
// `updatedAt`. A tiny `meta` store keeps the last-opened id and the migration
// flag. Everything here is async (IndexedDB has no sync API).

const DB_NAME = 'beadwork3'
const DB_VERSION = 1
const ARTWORKS = 'artworks'
const META = 'meta'

let dbPromise = null
function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ARTWORKS)) db.createObjectStore(ARTWORKS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META) // keyless: put(value, key)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

// Run one request inside a transaction and resolve with its result.
async function run(store, mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => resolve(req ? req.result : undefined)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export const listArtworks = () => run(ARTWORKS, 'readonly', (s) => s.getAll())
export const getArtwork = (id) => run(ARTWORKS, 'readonly', (s) => s.get(id))
export const putArtwork = (rec) => run(ARTWORKS, 'readwrite', (s) => s.put(rec))
export const deleteArtwork = (id) => run(ARTWORKS, 'readwrite', (s) => s.delete(id))

export const getMeta = (key) => run(META, 'readonly', (s) => s.get(key))
export const setMeta = (key, value) => run(META, 'readwrite', (s) => s.put(value, key))
