/**
 * LaMa ONNX Inpainting — 端侧推理层
 *
 * 模型来源: https://huggingface.co/Carve/LaMa-ONNX
 * 输入: image [1,3,512,512] + mask [1,1,512,512]
 * 输出: inpainted [1,3,512,512]
 *
 * 策略: 裁剪 mask 区域 → 缩放到 512 → 推理 → 拼回原图
 */

import Ort from 'onnxruntime-web'

// ===== 配置 =====
const MODEL_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx'
const MODEL_SIZE = 134 * 1024 * 1024  // approx 134MB
const LAMA_INPUT_SIZE = 512
const PADDING = 48  // 裁剪区域额外 padding（像素）

// ===== IndexedDB 缓存 =====
const DB_NAME = 'lama-onnx-cache'
const STORE_NAME = 'models'
const MODEL_KEY = 'lama_fp32'

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getCachedModel(): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(MODEL_KEY)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function cacheModel(buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(buffer, MODEL_KEY)
  } catch {
    // 缓存失败不影响功能
  }
}

// ===== 模型加载 =====

let session: Ort.InferenceSession | null = null
let loadingPromise: Promise<Ort.InferenceSession> | null = null

export async function loadLamaModel(
  onProgress?: (loaded: number, total: number) => void
): Promise<Ort.InferenceSession> {
  if (session) return session
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    // 设置 WASM 路径
    Ort.env.wasm.wasmPaths = './'

    // 尝试从 IndexedDB 加载
    let modelBuffer = await getCachedModel()

    if (!modelBuffer) {
      // 从 HuggingFace CDN 下载
      onProgress?.(0, MODEL_SIZE)
      const response = await fetch(MODEL_URL)
      const contentLength = Number(response.headers.get('content-length') || MODEL_SIZE)

      if (!response.body) {
        // 不支持 streaming，直接下载
        modelBuffer = await response.arrayBuffer()
        onProgress?.(contentLength, contentLength)
      } else {
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let loaded = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          loaded += value.length
          onProgress?.(loaded, contentLength)
        }

        // 合并 chunks
        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
        modelBuffer = new ArrayBuffer(totalLength)
        const view = new Uint8Array(modelBuffer)
        let offset = 0
        for (const chunk of chunks) {
          view.set(chunk, offset)
          offset += chunk.length
        }
      }

      // 缓存到 IndexedDB
      await cacheModel(modelBuffer)
    }

    // 创建推理 session
    session = await Ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],  // wasm 优先，兼容性最好
      graphOptimizationLevel: 'all',
    })

    return session
  })()

  try {
    return await loadingPromise
  } catch (e) {
    loadingPromise = null
    throw e
  }
}

// ===== 图像预处理 =====

/** Canvas → Float32Array [1,3,H,W]，RGB 归一化到 0-1 */
function canvasToFloat32Array(canvas: HTMLCanvasElement): { data: Float32Array; shape: number[] } {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { width, height } = canvas
  const shape = [1, 3, height, width]
  const float32Array = new Float32Array(3 * height * width)

  // imageData.data 是 RGBA，按像素排列
  // ONNX 需要 NCHW：[1, 3, H, W]，即 R通道 H*W → G通道 H*W → B通道 H*W
  for (let i = 0; i < imageData.data.length; i += 4) {
    const pixelIdx = i / 4
    const row = pixelIdx / width | 0
    const col = pixelIdx % width
    const hwIdx = row * width + col

    float32Array[hwIdx] = imageData.data[i] / 255.0         // R
    float32Array[height * width + hwIdx] = imageData.data[i + 1] / 255.0  // G
    float32Array[2 * height * width + hwIdx] = imageData.data[i + 2] / 255.0  // B
  }

  return { data: float32Array, shape }
}

/** Mask Canvas → Float32Array [1,1,H,W]，二值化（有像素=1, 无像素=0） */
function maskToFloat32Array(canvas: HTMLCanvasElement): { data: Float32Array; shape: number[] } {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { width, height } = canvas
  const shape = [1, 1, height, width]
  const float32Array = new Float32Array(height * width)

  for (let i = 0; i < imageData.data.length; i += 4) {
    const pixelIdx = i / 4 | 0
    // 只要 alpha > 50 或者 RGB 总值 > 0 就认为是 mask 区域
    const isMasked = imageData.data[i + 3] > 50 ||
      (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) > 0
    float32Array[pixelIdx] = isMasked ? 1.0 : 0.0
  }

  return { data: float32Array, shape }
}

/** ONNX 输出 [1,3,H,W] Float32 → Canvas */
function outputToCanvas(outputData: Float32Array, height: number, width: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(width, height)

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const hwIdx = row * width + col
      const pixelIdx = hwIdx * 4

      imageData.data[pixelIdx] = Math.round(outputData[hwIdx] * 255)          // R
      imageData.data[pixelIdx + 1] = Math.round(outputData[height * width + hwIdx] * 255)  // G
      imageData.data[pixelIdx + 2] = Math.round(outputData[2 * height * width + hwIdx] * 255)  // B
      imageData.data[pixelIdx + 3] = 255  // A
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

// ===== 核心 inpainting =====

export interface InpaintOptions {
  imageCanvas: HTMLCanvasElement    // 原图（完整尺寸）
  maskCanvas: HTMLCanvasElement     // mask（完整尺寸，与原图同宽高）
  onProgress?: (loaded: number, total: number) => void
}

export interface InpaintResult {
  resultCanvas: HTMLCanvasElement   // 结果（完整尺寸）
  cropRegion: { x: number; y: number; w: number; h: number }  // 裁剪区域信息
}

/**
 * 执行 inpainting：
 * 1. 找到 mask 区域 bounding box + padding
 * 2. 裁剪并缩放到 512×512
 * 3. LaMa 推理
 * 4. 缩放回原始裁剪尺寸
 * 5. 拼回原图（只替换 mask 区域）
 */
export async function inpaint(options: InpaintOptions): Promise<InpaintResult> {
  const { imageCanvas, maskCanvas, onProgress } = options

  // 加载模型
  const sess = await loadLamaModel(onProgress)

  const origW = imageCanvas.width
  const origH = imageCanvas.height

  // 1. 找 mask bounding box
  const maskCtx = maskCanvas.getContext('2d')!
  const maskData = maskCtx.getImageData(0, 0, origW, origH)
  let minX = origW, minY = origH, maxX = 0, maxY = 0
  let hasMask = false

  for (let y = 0; y < origH; y++) {
    for (let x = 0; x < origW; x++) {
      const i = (y * origW + x) * 4
      if (maskData.data[i + 3] > 50 || (maskData.data[i] + maskData.data[i + 1] + maskData.data[i + 2]) > 0) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        hasMask = true
      }
    }
  }

  if (!hasMask) {
    throw new Error('没有标记区域')
  }

  // 加 padding，确保不超出图片边界
  const pad = PADDING
  const cropX = Math.max(0, minX - pad)
  const cropY = Math.max(0, minY - pad)
  const cropW = Math.min(origW - cropX, maxX - minX + 1 + 2 * pad)
  const cropH = Math.min(origH - cropY, maxY - minY + 1 + 2 * pad)

  // 2. 裁剪原图和 mask
  const cropImageCanvas = document.createElement('canvas')
  cropImageCanvas.width = cropW
  cropImageCanvas.height = cropH
  const cropImageCtx = cropImageCanvas.getContext('2d')!
  cropImageCtx.drawImage(imageCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

  const cropMaskCanvas = document.createElement('canvas')
  cropMaskCanvas.width = cropW
  cropMaskCanvas.height = cropH
  const cropMaskCtx = cropMaskCanvas.getContext('2d')!
  cropMaskCtx.drawImage(maskCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

  // 3. 缩放到 512×512
  const resizedImage = document.createElement('canvas')
  resizedImage.width = LAMA_INPUT_SIZE
  resizedImage.height = LAMA_INPUT_SIZE
  resizedImage.getContext('2d')!.drawImage(cropImageCanvas, 0, 0, LAMA_INPUT_SIZE, LAMA_INPUT_SIZE)

  const resizedMask = document.createElement('canvas')
  resizedMask.width = LAMA_INPUT_SIZE
  resizedMask.height = LAMA_INPUT_SIZE
  resizedMask.getContext('2d')!.drawImage(cropMaskCanvas, 0, 0, LAMA_INPUT_SIZE, LAMA_INPUT_SIZE)

  // 4. 转 tensor 并推理
  const imgTensor = canvasToFloat32Array(resizedImage)
  const maskTensor = maskToFloat32Array(resizedMask)

  const inputImage = new Ort.Tensor('float32', imgTensor.data, imgTensor.shape as [number, number, number, number])
  const inputMask = new Ort.Tensor('float32', maskTensor.data, maskTensor.shape as [number, number, number, number])

  const results = await sess.run({ image: inputImage, mask: inputMask })

  // 输出 tensor 名称通常是 'output' 或类似
  const outputName = sess.outputNames[0]
  const outputTensor = results[outputName] as Ort.Tensor
  const outputData = outputTensor.data as Float32Array

  // 5. 输出转 canvas (512×512)
  const result512 = outputToCanvas(outputData, LAMA_INPUT_SIZE, LAMA_INPUT_SIZE)

  // 6. 缩放回裁剪区域原始尺寸
  const resultCrop = document.createElement('canvas')
  resultCrop.width = cropW
  resultCrop.height = cropH
  resultCrop.getContext('2d')!.drawImage(result512, 0, 0, cropW, cropH)

  // 7. 拼回原图：先画原图，再在 mask 区域画结果（仅 mask 部分）
  const resultCanvas = document.createElement('canvas')
  resultCanvas.width = origW
  resultCanvas.height = origH
  const resultCtx = resultCanvas.getContext('2d')!

  // 画原图
  resultCtx.drawImage(imageCanvas, 0, 0)

  // 在裁剪区域，用 mask 作为 clip，只替换 mask 覆盖的像素
  resultCtx.save()

  // 创建只包含 mask 区域的裁剪路径（使用原图 mask）
  // 为了更自然的过渡，在 mask 边缘做 2px 柔化：
  // 先画结果全区域，再用原图非 mask 区域覆盖回去
  // 但最简单的方式：直接画结果到裁剪区域，mask 外的区域会被原像素覆盖

  // 更好的方法：使用 globalCompositeOperation
  // 1. 先画结果（覆盖裁剪区域）
  resultCtx.drawImage(resultCrop, cropX, cropY)

  // 2. 用原图覆盖裁剪区域内非 mask 的部分（恢复非 mask 区域的原始像素）
  // 创建一个临时 canvas：原图裁剪区域中非 mask 部分
  const restoreCanvas = document.createElement('canvas')
  restoreCanvas.width = cropW
  restoreCanvas.height = cropH
  const restoreCtx = restoreCanvas.getContext('2d')!

  // 画原图裁剪区域
  restoreCtx.drawImage(imageCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

  // 用 mask 的反转（非 mask 区域）来裁剪
  // 方式：画原图裁剪 → 用 mask 做 destination-out（去掉 mask 区域）→ 剩下就是非 mask 区域
  restoreCtx.globalCompositeOperation = 'destination-out'
  restoreCtx.drawImage(cropMaskCanvas, 0, 0)
  restoreCtx.globalCompositeOperation = 'source-over'

  // 把非 mask 区域的原图拼回结果
  resultCtx.drawImage(restoreCanvas, cropX, cropY)

  resultCtx.restore()

  return {
    resultCanvas,
    cropRegion: { x: cropX, y: cropY, w: cropW, h: cropH },
  }
}

/** 检查模型是否已缓存（避免下载） */
export async function isModelCached(): Promise<boolean> {
  const cached = await getCachedModel()
  return cached !== null
}

/** 获取模型缓存大小（bytes） */
export async function getCacheSize(): Promise<number> {
  const cached = await getCachedModel()
  return cached?.byteLength ?? 0
}