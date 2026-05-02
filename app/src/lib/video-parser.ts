/**
 * 视频解析器抽象层 — 多源自动轮询
 *
 * 内置多个公开免费解析 API 源，按优先级自动尝试，失败自动切换下一个。
 * 用户自部署 API 作为最高优先级可选配置。
 */

// ===== Types =====

export interface VideoInfo {
  title: string
  coverUrl: string
  videoUrl: string       // 无水印视频下载地址
  duration?: number      // 秒
  resolution?: string
  author?: string
  platform: string
  isImageSet?: boolean   // 是否为图集
  images?: string[]      // 图集图片URL列表
  sourceName: string     // 使用的解析源名称
}

export interface ParseProgress {
  sourceName: string
  status: 'trying' | 'success' | 'failed'
  error?: string
}

// ===== 平台检测 =====

const PLATFORM_PATTERNS: { pattern: RegExp; name: string; icon: string }[] = [
  { pattern: /douyin\.com|v\.douyin\.com/, name: '抖音', icon: '🎵' },
  { pattern: /kuaishou\.com/, name: '快手', icon: '⚡' },
  { pattern: /tiktok\.com/, name: 'TikTok', icon: '📱' },
  { pattern: /bilibili\.com|b23\.tv/, name: 'B站', icon: '📺' },
  { pattern: /xiaohongshu\.com|xhslink\.com/, name: '小红书', icon: '📕' },
  { pattern: /weibo\.com|weibo\.cn|m\.weibo\.cn/, name: '微博', icon: '🔴' },
  { pattern: /youtube\.com|youtu\.be/, name: 'YouTube', icon: '▶️' },
  { pattern: /pipix\.com|pipixia/, name: '皮皮虾', icon: '🦐' },
  { pattern: /ixigua\.com|watermelon/, name: '西瓜视频', icon: '🍉' },
]

export function detectPlatform(url: string): { name: string; icon: string } {
  for (const p of PLATFORM_PATTERNS) {
    if (p.pattern.test(url)) return { name: p.name, icon: p.icon }
  }
  return { name: '未知', icon: '🎬' }
}

// ===== URL 提取 =====

const URL_REGEX = /https?:\/\/[^\s<>"']+/g

export function extractUrls(text: string): string[] {
  const urls = text.match(URL_REGEX)
  if (!urls) return []
  return [...new Set(urls.map(u => u.replace(/[。，,.！!）)\s]+$/, '')))]
}

// ===== 解析源定义 =====

interface ParseSource {
  name: string
  /** 构造解析 API 请求 URL */
  buildApiUrl: (originalUrl: string, apiBase: string) => string
  /** 从 API 响应 JSON 中提取视频信息 */
  extractData: (json: any, originalUrl: string, platform: string) => VideoInfo | null
  /** 是否需要 CORS 代理 */
  needsProxy: boolean
  /** CORS 代理 URL（如果需要） */
  proxyUrl?: string
}

const SOURCES: ParseSource[] = [
  // 源1: 用户自部署的 Douyin_TikTok_Download_API（最高优先级）
  {
    name: '自部署API',
    buildApiUrl: (url, apiBase) => `${apiBase}/api/hybrid/video_data?url=${encodeURIComponent(url)}&minimal=false`,
    extractData: (json, _url, platform) => {
      const d = json?.data || json
      if (!d) return null

      const title = d.desc || d.title || d.video_desc || '未知标题'
      const coverUrl = d.cover?.url_list?.[0] || d.cover || d.origin_cover || d.dynamic_cover?.url_list?.[0] || ''
      
      const videoUrl = d.video?.play_addr?.url_list?.[0]
        || d.video?.play_addr?.data?.url
        || d.download?.url_list?.[0]
        || d.download_addr?.url_list?.[0]
        || d.video_url
        || ''

      const images = d.images?.url_list || d.image_list?.map((img: any) => img.url_list?.[0] || img.url) || undefined
      const isImageSet = !videoUrl && images && images.length > 0

      return {
        title: title.slice(0, 80),
        coverUrl,
        videoUrl,
        duration: d.duration || undefined,
        resolution: d.video?.ratio || d.ratio || undefined,
        author: d.author?.nickname || d.author_name || undefined,
        platform,
        isImageSet,
        images: isImageSet ? images : undefined,
        sourceName: '自部署API',
      }
    },
    needsProxy: false,
  },

  // 源2: douyin.wtf 公开站点
  {
    name: 'douyin.wtf',
    buildApiUrl: (url, _) => `https://api.douyin.wtf/api/hybrid/video_data?url=${encodeURIComponent(url)}&minimal=false`,
    extractData: (json, _url, platform) => {
      // 同源1的数据格式
      const d = json?.data || json
      if (!d) return null

      const title = d.desc || d.title || d.video_desc || '未知标题'
      const coverUrl = d.cover?.url_list?.[0] || d.cover || d.origin_cover || ''
      
      const videoUrl = d.video?.play_addr?.url_list?.[0]
        || d.video?.play_addr?.data?.url
        || d.download?.url_list?.[0]
        || d.video_url
        || ''

      return {
        title: title.slice(0, 80),
        coverUrl,
        videoUrl,
        duration: d.duration || undefined,
        resolution: d.video?.ratio || d.ratio || undefined,
        author: d.author?.nickname || undefined,
        platform,
        sourceName: 'douyin.wtf',
      }
    },
    needsProxy: true,
    proxyUrl: 'https://api.allorigins.win/raw?url=',
  },

  // 源3: TikHub 公开 API（免费tier，需 API key，暂作为备选）
  {
    name: 'TikHub',
    buildApiUrl: (_url, _) => {
      // TikHub 需要用户自行配置 API key，暂不启用自动解析
      return ''
    },
    extractData: (_json, _url, _platform) => null,
    needsProxy: false,
  },
]

// ===== CORS 代理 =====

const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
]

/** 尝试通过 CORS 代理发送请求 */
async function fetchWithProxy(url: string, useProxy: boolean, proxyUrl?: string): Promise<Response> {
  if (!useProxy) {
    return fetch(url)
  }

  // 如果指定了特定代理
  if (proxyUrl) {
    const response = await fetch(proxyUrl + encodeURIComponent(url))
    if (response.ok) return response
  }

  // 尝试所有代理
  for (const proxy of CORS_PROXIES) {
    try {
      const response = await fetch(proxy + encodeURIComponent(url))
      if (response.ok) return response
    } catch {
      continue
    }
  }

  throw new Error('所有 CORS 代理均失败')
}

// ===== 核心解析函数 =====

const API_BASE_STORAGE_KEY = 'video-download-api-base'
const DEFAULT_API_BASE = 'http://localhost:80'

export function getApiBase(): string {
  return localStorage.getItem(API_BASE_STORAGE_KEY) || DEFAULT_API_BASE
}

export function saveApiBase(base: string): void {
  localStorage.setItem(API_BASE_STORAGE_KEY, base)
}

/**
 * 解析视频 URL，自动轮询多个 API 源
 * @param url 视频原始链接
 * @param onProgress 进度回调（报告每个源的尝试状态）
 * @param customApiBase 用户自定义 API 地址（可选）
 */
export async function parseVideo(
  url: string,
  onProgress?: (progress: ParseProgress) => void,
  customApiBase?: string,
): Promise<VideoInfo> {
  const platformInfo = detectPlatform(url)
  const apiBase = customApiBase || getApiBase()

  // 按优先级尝试每个源
  for (const source of SOURCES) {
    // TikHub 暂时跳过（需要 API key）
    if (source.name === 'TikHub') continue

    // 自部署 API 只在用户配置了非 localhost 地址时才尝试
    if (source.name === '自部署API' && apiBase === DEFAULT_API_BASE) continue

    const apiUrl = source.buildApiUrl(url, apiBase)
    if (!apiUrl) continue

    onProgress?.({ sourceName: source.name, status: 'trying' })

    try {
      const response = await fetchWithProxy(apiUrl, source.needsProxy, source.proxyUrl)
      
      if (!response.ok) {
        onProgress?.({ sourceName: source.name, status: 'failed', error: `HTTP ${response.status}` })
        continue
      }

      const json = await response.json()
      const info = source.extractData(json, url, platformInfo.name)

      if (info && (info.videoUrl || (info.isImageSet && info.images?.length))) {
        onProgress?.({ sourceName: source.name, status: 'success' })
        return info
      }

      onProgress?.({ sourceName: source.name, status: 'failed', error: '解析结果无视频地址' })
    } catch (err: any) {
      onProgress?.({ sourceName: source.name, status: 'failed', error: err.message?.slice(0, 50) || '请求失败' })
    }
  }

  throw new Error('所有解析源均失败，请配置自部署 API 或检查链接是否有效')
}

// ===== 流式下载（带进度） =====

export async function downloadWithProgress(
  url: string,
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载失败: HTTP ${response.status}`)

  const contentLength = Number(response.headers.get('content-length') || 0)
  
  if (!response.body || contentLength === 0) {
    // 无法追踪进度，直接下载
    const blob = await response.blob()
    onProgress?.(100)
    return blob
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (contentLength > 0) {
      onProgress?.(Math.round(received / contentLength * 100))
    }
  }

  // 合并 chunks
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
  const buffer = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }

  onProgress?.(100)
  return new Blob([buffer])
}

// ===== 历史记录 =====

const HISTORY_KEY = 'video-download-history'
const MAX_HISTORY = 20

export interface HistoryItem {
  id: string
  url: string
  title: string
  platform: string
  coverUrl: string
  timestamp: number
}

export function getHistory(): HistoryItem[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

export function addToHistory(item: HistoryItem): void {
  const history = getHistory()
  const newHistory = [item, ...history.filter(h => h.url !== item.url)].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY)
}