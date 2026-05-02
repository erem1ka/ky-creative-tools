/**
 * 万擎 API 统一调用层
 * 封装 Seedance (文生视频)、Seed (LLM)、Seedream (文生图) 三个 API
 */

const BASE_URL = 'https://wanqing-api.corp.kuaishou.com/api/gateway/v1'

// ===== localStorage key names =====
const LS_SEEDANCE_KEY = 'ky-seedance-key'
const LS_SEED_KEY = 'ky-seed-key'
const LS_SEEDREAM_KEY = 'ky-seedream-key'

// ===== Model IDs (公开，非敏感) =====
export const SEEDANCE_MODEL = 'ep-45dx0b-1776500367013449839'
export const SEED_MODEL = 'ep-it371f-1776499537149405492'
export const SEEDREAM_MODEL = 'ep-pehus5-1776417497039531742'

// ===== API Key getters（纯 localStorage，无硬编码 fallback） =====
// 每个用户需自行在页面中配置自己的 API Key
export function getSeedanceKey(): string {
  return localStorage.getItem(LS_SEEDANCE_KEY) || ''
}
export function getSeedKey(): string {
  return localStorage.getItem(LS_SEED_KEY) || ''
}
export function getSeedreamKey(): string {
  return localStorage.getItem(LS_SEEDREAM_KEY) || ''
}

// 检查是否已配置 key
export function hasSeedanceKey(): boolean { return !!getSeedanceKey() }
export function hasSeedKey(): boolean { return !!getSeedKey() }
export function hasSeedreamKey(): boolean { return !!getSeedreamKey() }

export function saveSeedanceKey(key: string) { localStorage.setItem(LS_SEEDANCE_KEY, key) }
export function saveSeedKey(key: string) { localStorage.setItem(LS_SEED_KEY, key) }
export function saveSeedreamKey(key: string) { localStorage.setItem(LS_SEEDREAM_KEY, key) }

// ===== Types =====

export interface VideoTaskOptions {
  prompt: string
  duration?: number       // 5 | 10
  resolution?: string     // '1080p' | '720p' | '480p'
  size?: string           // '16:9' | '9:16' | '1:1' | '4:3' | '3:4'
  watermark?: boolean
}

export interface VideoTaskResult {
  taskId: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  videoUrl?: string
  error?: string
}

export interface ImageTaskOptions {
  prompt: string
  size?: string           // '2K' | '1K' | '512x512' etc.
  response_format?: 'url' | 'b64_json'
  watermark?: boolean
  stream?: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ===== Seedance: 文生视频 =====

/** 提交视频生成任务（异步） */
export async function submitVideoTask(options: VideoTaskOptions): Promise<string> {
  const res = await fetch(`${BASE_URL}/videos/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getSeedanceKey()}`,
      'Content-Type': 'application/json',
      'X-Ks-Wq-Async': 'enable',
    },
    body: JSON.stringify({
      model: SEEDANCE_MODEL,
      prompt: options.prompt,
      duration: options.duration ?? 5,
      resolution: options.resolution ?? '720p',
      size: options.size ?? '16:9',
      watermark: options.watermark ?? false,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`提交视频任务失败: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  const taskId = data.data?.task_id || data.task_id || data.id

  if (!taskId) {
    throw new Error('未返回任务 ID，响应: ' + JSON.stringify(data).slice(0, 300))
  }

  return taskId
}

/** 轮询视频任务状态 */
export async function pollVideoTask(taskId: string): Promise<VideoTaskResult> {
  const res = await fetch(
    `${BASE_URL}/endpoints/${SEEDANCE_MODEL}/tasks/${taskId}`,
    { headers: { 'Authorization': `Bearer ${getSeedanceKey()}` } }
  )

  if (!res.ok) throw new Error('查询视频任务失败')

  const data = await res.json()
  console.log('[wanqing] pollVideoTask response:', JSON.stringify(data, null, 2))

  // 状态提取（多种可能的字段路径）
  const statusRaw =
    data.data?.task_status ||
    data.task_status ||
    data.status ||
    data.data?.status

  // 标准化状态
  let status: VideoTaskResult['status']
  if (statusRaw === 'SUCCEEDED' || statusRaw === 'succeeded' || statusRaw === 'SUCCESS' || statusRaw === 'completed') {
    status = 'succeeded'
  } else if (statusRaw === 'FAILED' || statusRaw === 'failed' || statusRaw === 'ERROR' || statusRaw === 'error') {
    status = 'failed'
  } else if (statusRaw === 'RUNNING' || statusRaw === 'running' || statusRaw === 'PROCESSING' || statusRaw === 'processing') {
    status = 'running'
  } else {
    status = 'pending'
  }

  // 视频URL提取（多种可能的字段路径）
  const videoUrl =
    data.data?.video?.url ||
    data.data?.video_url ||
    data.data?.result?.video_url ||
    data.data?.result?.url ||
    data.output?.video_url ||
    data.output?.url ||
    data.video_url ||
    data.url ||
    data.result?.video_url ||
    data.result?.url

  const error = status === 'failed'
    ? (data.data?.error || data.error || data.data?.fail_reason || '视频生成失败')
    : undefined

  return { taskId, status, videoUrl, error }
}

// ===== Seed: LLM 对话 =====

/** 调用 Seed 2.0 Pro 大模型对话 */
export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${BASE_URL}/endpoints/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getSeedKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: SEED_MODEL,
      messages,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LLM 调用失败: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()

  // 提取回复文本（兼容多种响应格式）
  const reply =
    data.choices?.[0]?.message?.content ||
    data.data?.choices?.[0]?.message?.content ||
    data.output?.text ||
    data.content ||
    data.data?.content ||
    ''

  if (!reply) {
    throw new Error('LLM 未返回有效回复，响应: ' + JSON.stringify(data).slice(0, 300))
  }

  return reply
}

// ===== Seedream: 文生图 =====

/** 调用 Seedream 5.0 Lite 生成图片 */
export async function generateImage(options: ImageTaskOptions): Promise<string> {
  const res = await fetch(`${BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getSeedreamKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: SEEDREAM_MODEL,
      prompt: options.prompt,
      size: options.size ?? '2K',
      response_format: options.response_format ?? 'url',
      watermark: options.watermark ?? false,
      stream: options.stream ?? false,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`图片生成失败: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  console.log('[wanqing] generateImage response:', JSON.stringify(data, null, 2))

  // 提取图片URL（兼容多种响应格式）
  const imageUrl =
    data.data?.url ||
    data.data?.image_url ||
    data.data?.images?.[0]?.url ||
    data.data?.[0]?.url ||
    data.url ||
    data.images?.[0]?.url ||
    data.output?.url ||
    data.result?.url

  if (!imageUrl) {
    // 如果是 b64_json 格式，可能有 data 字段
    const b64 = data.data?.b64_json || data.data?.images?.[0]?.b64_json
    if (b64) return `data:image/png;base64,${b64}`

    throw new Error('未获取到图片地址，响应: ' + JSON.stringify(data).slice(0, 300))
  }

  return imageUrl
}