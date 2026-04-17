import React, { useState, useRef, useEffect } from 'react'
import { downloadBlob, generateFilename, showToast, handlePasteImage } from '../lib/utils'

export default function Palette() {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [colors, setColors] = useState<string[]>([])
  const [colorCount, setColorCount] = useState(5)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || !fileList[0]) return
    const file = fileList[0]
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        setImgEl(img)
        extractColors(img)
      }
      img.src = e.target.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault()
        handlePasteImage(f => handleFiles([f]))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (imgEl) extractColors(imgEl)
  }, [colorCount])

  const extractColors = (img: HTMLImageElement) => {
    const c = canvasRef.current!
    const size = 100
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, size, size)

    const imageData = ctx.getImageData(0, 0, size, size).data
    const pixelMap = new Map<string, number>()

    // 采样像素
    for (let i = 0; i < imageData.length; i += 4 * 4) {
      const r = Math.round(imageData[i] / 16) * 16
      const g = Math.round(imageData[i + 1] / 16) * 16
      const b = Math.round(imageData[i + 2] / 16) * 16
      const a = imageData[i + 3]
      if (a < 128) continue // 跳过透明像素
      const key = `${r},${g},${b}`
      pixelMap.set(key, (pixelMap.get(key) || 0) + 1)
    }

    // 排序取前 N 个
    const sorted = [...pixelMap.entries()].sort((a, b) => b[1] - a[1])
    const topColors = sorted.slice(0, colorCount).map(([rgb]) => {
      const [r, g, b] = rgb.split(',').map(Number)
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    })

    setColors(topColors)
  }

  const copyColor = (color: string) => {
    navigator.clipboard.writeText(color)
    showToast(`已复制 ${color}`)
  }

  if (!imgEl) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="border-2 border-dashed border-[var(--border)] rounded-xl p-10 text-center cursor-pointer hover:border-[var(--accent)] transition bg-[var(--surface2)]"
        onClick={() => document.getElementById('fileInput')?.click()}
      >
        <input id="fileInput" type="file" accept="image/*" onChange={e => handleFiles(e.target.files)} className="hidden" />
        <div className="text-3xl mb-3">🎨</div>
        <div className="text-sm font-medium mb-1">点击或拖入图片</div>
        <div className="text-xs text-[var(--text2)]">自动提取主色调</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* 颜色数量 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">颜色数量</label>
          <span className="text-xs font-mono text-[var(--text2)]">{colorCount} 种</span>
        </div>
        <input
          type="range"
          min="3"
          max="12"
          step="1"
          value={colorCount}
          onChange={e => setColorCount(parseInt(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      {/* 原图预览 */}
      <div className="flex gap-4">
        <img src={imgEl.src} className="w-32 h-32 object-cover rounded-xl" alt="原图" />
        <div className="flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-3">提取结果</div>
          <div className="flex flex-wrap gap-2">
            {colors.map((c, i) => (
              <button
                key={i}
                onClick={() => copyColor(c)}
                className="group relative w-12 h-12 rounded-lg shadow-lg transition hover:scale-105"
                style={{ backgroundColor: c }}
                title={`${c} (点击复制)`}
              >
                <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center text-white/70 opacity-0 group-hover:opacity-100 transition">
                  {c}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 色板 */}
      {colors.length > 0 && (
        <div className="border-t border-[var(--border)] pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">色板</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(colors.join(', '))
                showToast('已复制所有颜色')
              }}
              className="px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] text-xs hover:border-[var(--accent)] transition"
            >
              复制全部
            </button>
          </div>
          <div className="flex rounded-xl overflow-hidden border border-[var(--border)]">
            {colors.map((c, i) => (
              <div
                key={i}
                className="flex-1 h-16 cursor-pointer hover:opacity-90 transition"
                style={{ backgroundColor: c }}
                onClick={() => copyColor(c)}
                title={`${c} (点击复制)`}
              />
            ))}
          </div>
          <div className="flex gap-4 mt-3">
            {colors.map((c, i) => (
              <span key={i} className="text-[10px] font-mono text-[var(--text2)]">{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
