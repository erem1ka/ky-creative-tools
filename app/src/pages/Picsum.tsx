import { useState } from 'react'
import { downloadBlob, generateFilename, showToast } from '../lib/utils'

const sizes = [
  { label: '2K', w: 2560, h: 1440 },
  { label: '4K', w: 3840, h: 2160 },
  { label: 'HD', w: 1920, h: 1080 },
  { label: 'Square', w: 1080, h: 1080 },
]

export default function Picsum() {
  const [selectedSize, setSelectedSize] = useState(sizes[0])
  const [seed, setSeed] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const generate = () => {
    setLoading(true)
    const sizeParam = `${selectedSize.w}x${selectedSize.h}`
    const seedParam = seed ? `?seed=${seed}` : ''
    const url = `https://picsum.photos/${sizeParam}${seedParam}`

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImageUrl(url)
      setLoading(false)
    }
    img.onerror = () => {
      setLoading(false)
      showToast('加载失败，请重试', 'error')
    }
    img.src = url
  }

  const downloadImage = async () => {
    if (!imageUrl) return
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      downloadBlob(blob, generateFilename('picsum', 'jpg'))
      showToast('下载成功')
    } catch {
      showToast('下载失败', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-3 block">尺寸</label>
        <div className="grid grid-cols-2 gap-2">
          {sizes.map(s => (
            <button
              key={s.label}
              onClick={() => setSelectedSize(s)}
              className={`px-4 py-3 rounded-lg border font-bold transition ${
                selectedSize.label === s.label
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
              }`}
            >
              <div>{s.label}</div>
              <div className="text-xs font-mono mt-0.5 opacity-70">{s.w}×{s.h}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-2 block">
          Seed（可选，留空随机）
        </label>
        <input
          type="text"
          value={seed}
          onChange={e => setSeed(e.target.value)}
          placeholder="输入任意文字作为种子"
          className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm focus:border-[var(--accent)] outline-none"
        />
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] text-white font-bold text-sm disabled:opacity-50"
      >
        {loading ? '生成中...' : '生成图片'}
      </button>

      {imageUrl && (
        <div className="border-t border-[var(--border)] pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">生成结果</span>
            <button onClick={downloadImage} className="px-4 py-2 rounded-lg bg-[var(--success)] text-white text-xs font-semibold">
              ↓ 下载
            </button>
          </div>
          <div className="relative rounded-xl overflow-hidden border border-[var(--border)]">
            <img src={imageUrl} className="w-full" alt="生成的图片" />
          </div>
          <div className="text-xs text-[var(--text2)] mt-2 text-center font-mono">
            {selectedSize.w} × {selectedSize.h}
          </div>
        </div>
      )}
    </div>
  )
}
