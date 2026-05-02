import { FFmpeg } from '@ffmpeg/ffmpeg'

const CACHE_NAME = 'ffmpeg-core-v1'
const CORE_URL = '/ffmpeg/ffmpeg-core.js'
const WASM_URL = '/ffmpeg/ffmpeg-core.wasm'

// Singleton FFmpeg instance - shared across all pages
let ffmpegInstance: FFmpeg | null = null
let ffmpegLoaded = false
let loadingPromise: Promise<boolean> | null = null

// Fetch with Cache API fallback
async function fetchWithCache(url: string, mimeType: string): Promise<string> {
  const cache = await caches.open(CACHE_NAME)
  
  // Try cache first
  const cached = await cache.match(url)
  if (cached) {
    console.log('[ffmpeg-cache] Using cached:', url)
    const buf = await cached.arrayBuffer()
    const blob = new Blob([buf], { type: mimeType })
    return URL.createObjectURL(blob)
  }

  // Fetch and cache
  console.log('[ffmpeg-cache] Fetching:', url)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  
  // Cache the response (clone it since we need to consume both)
  await cache.put(url, response.clone())
  
  const buf = await response.arrayBuffer()
  const blob = new Blob([buf], { type: mimeType })
  return URL.createObjectURL(blob)
}

export async function loadFfmpeg(): Promise<{ ffmpeg: FFmpeg; loaded: boolean }> {
  // Return existing if already loaded
  if (ffmpegLoaded && ffmpegInstance) {
    return { ffmpeg: ffmpegInstance, loaded: true }
  }

  // If currently loading, wait for it
  if (loadingPromise) {
    const loaded = await loadingPromise
    return { ffmpeg: ffmpegInstance!, loaded: loaded }
  }

  // Start loading
  loadingPromise = (async () => {
    if (!ffmpegInstance) {
      ffmpegInstance = new FFmpeg()
    }
    const ffmpeg = ffmpegInstance

    ffmpeg.on('log', ({ message }) => console.log('[ffmpeg]', message))

    try {
      const coreURL = await fetchWithCache(CORE_URL, 'text/javascript')
      const wasmURL = await fetchWithCache(WASM_URL, 'application/wasm')
      await ffmpeg.load({ coreURL, wasmURL })
      ffmpegLoaded = true
      console.log('[ffmpeg-cache] FFmpeg loaded successfully!')
      return true
    } catch (err) {
      console.error('[ffmpeg-cache] FFmpeg load error:', err)
      loadingPromise = null
      return false
    }
  })()

  const loaded = await loadingPromise
  if (!loaded) loadingPromise = null
  return { ffmpeg: ffmpegInstance!, loaded: loaded }
}

export function isFfmpegLoaded(): boolean {
  return ffmpegLoaded
}