import { useState, useRef, useEffect } from 'react'
import { generateFilename, showToast, handlePasteImage } from '../lib/utils'

const presets = [
  { label: 'Instagram 正方形', w: 1080, h: 1080 },
  { label: 'Instagram 竖版', w: 1080, h: 1350 },
  { label: 'Instagram 横版', w: 1080, h: 566 },
  { label: 'YouTube 缩略图', w: 1280, h: 720 },
  { label: 'Twitter 头像', w: 400, h: 400 },
  { label: '微信头像', w: 500, h: 500 },
]

export default function Resize() {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [originalSize, setOriginalSize] = useState({ w: 0, h: 0 })
  const [targetW, setTargetW] = useState(0)
  const [targetH, setTargetH] = useState(0)
  const [lockRatio, setLockRatio] = useState(true)
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleFiles = (fileList: FileList | File[]) => {
    if (!fileList || !fileList[0]) return
    const file = fileList[0]
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        setImgEl(img)
        setOriginalSize({ w: img.width, h: img.height })
        setTargetW(img.width)
        setTargetH(img.height)
        setResultDataUrl(null)
      }
      img.src = e.target!.result as string
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

  const handleWidthChange = (w: number) => {
    setTargetW(w)
    if (lockRatio && originalSize.w > 0) {
      setTargetH(Math.round(w * (originalSize.h / originalSize.w)))
    }
  }

  const handleHeightChange = (h: number) => {
    setTargetH(h)
    if (lockRatio && originalSize.h > 0) {
      setTargetW(Math.round(h * (originalSize.w / originalSize.h)))
    }
  }

  const applyPreset = (preset: typeof presets[0]) => {
    setTargetW(preset.w)
    setTargetH(preset.h)
    setLockRatio(false)
  }

  const doResize = () => {
    if (!imgEl || targetW < 1 || targetH < 1) return
    const c = canvasRef.current!
    c.width = targetW
    c.height = targetH
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imgEl, 0, 0, targetW, targetH)
    const dataUrl = c.toDataURL('image/png')
    setResultDataUrl(dataUrl)
    showToast('尺寸已调整')
  }

  const downloadResult = () => {
    if (!resultDataUrl) return
    const a = document.createElement('a')
    a.href = resultDataUrl
    a.download = generateFilename('resize')
    a.click()
    showToast('下载成功')
  }

  if (!imgEl) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="border-2 border-dashed border-[var(--border)] rounded-xl p-10 text-center cursor-pointer hover:border-[var(--accent)] transition bg-[var(--surface2)]"
        onClick={() => document.getElementById('fileInput')?.click()}
      >
        <input id="fileInput" type="file" accept="image/*" onChange={e => e.target.files && handleFiles(e.target.files)} className="hidden" />
        <div className="text-3xl mb-3">📐</div>
        <div className="text-sm font-medium mb-1">点击或拖入图片</div>
        <div className="text-xs text-[var(--text2)]">Ctrl+V 粘贴</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-3 block">预设尺寸</label>
        <div className="grid grid-cols-2 gap-2">
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-xs text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--text)] transition text-left"
            >
              <div className="font-semibold">{p.label}</div>
              <div className="font-mono text-[10px] mt-0.5">{p.w} × {p.h}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-3 block">自定义尺寸</label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[10px] text-[var(--text2)] mb-1">宽度 (px)</div>
            <input
              type="number"
              value={targetW}
              onChange={e => handleWidthChange(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm font-mono focus:border-[var(--accent)] outline-none"
            />
          </div>
          <button
            onClick={() => setLockRatio(!lockRatio)}
            className={`px-3 py-2 rounded-lg border text-sm transition ${
              lockRatio ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)]'
            }`}
            title="锁定比例"
          >
            🔗
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-[var(--text2)] mb-1">高度 (px)</div>
            <input
              type="number"
              value={targetH}
              onChange={e => handleHeightChange(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm font-mono focus:border-[var(--accent)] outline-none"
            />
          </div>
        </div>
        <div className="text-xs text-[var(--text2)] mt-2">
          原始尺寸：{originalSize.w} × {originalSize.h} px
        </div>
      </div>

      <button onClick={doResize} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] text-white font-bold text-sm">调整尺寸</button>

      {resultDataUrl && (
        <div className="border-t border-[var(--border)] pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">结果</span>
            <span className="text-xs font-mono text-[var(--text2)]">{targetW} × {targetH} px</span>
            <button onClick={downloadResult} className="px-4 py-2 rounded-lg bg-[var(--success)] text-white text-xs font-semibold">↓ 下载</button>
          </div>
          <img src={resultDataUrl} className="max-w-full max-h-80 rounded-xl mx-auto" alt="结果" />
        </div>
      )}
    </div>
  )
}
