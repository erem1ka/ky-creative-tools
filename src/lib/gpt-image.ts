/**
 * GPT-Image-2 生图 API 前端调用层
 * 所有请求走 Vite dev server 的 /api/generate-image 代理，
 * API Key 仅在服务端使用，前端代码不包含任何密钥。
 */

export interface GenerateImageOptions {
  prompt: string
  size?: string       // '1024x1024' | '1024x1792' | '1792x1024'
  n?: number          // 1-4
  quality?: string    // 'high' | 'medium' | 'low'
}

export interface GeneratedImage {
  url?: string
  b64_json?: string
  revised_prompt?: string
}

export interface GenerateImageResult {
  images: GeneratedImage[]
  error?: string
}

/** 调用本地代理接口生成图片 */
export async function generateGPTImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
  const res = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: options.prompt,
      size: options.size ?? '1024x1024',
      n: options.n ?? 1,
      quality: options.quality ?? 'high',
    }),
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(errData.error || `请求失败 (${res.status})`)
  }

  const data = await res.json()

  // 兼容 Wanqing 包装格式 & 标准 OpenAI 格式
  const rawImages: GeneratedImage[] =
    data.data?.images ||
    data.data ||
    data.images ||
    data.output?.images ||
    (data.data?.url ? [data.data] : []) ||
    (data.url ? [{ url: data.url }] : [])

  // 处理 b64_json 格式
  const images = rawImages.map((img: GeneratedImage) => {
    if (img.b64_json && !img.url) {
      return { ...img, url: `data:image/png;base64,${img.b64_json}` }
    }
    return img
  })

  if (!images.length || !images.some(i => i.url)) {
    throw new Error('未获取到图片，响应: ' + JSON.stringify(data).slice(0, 300))
  }

  return { images }
}