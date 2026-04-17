import React, { useState, useRef, useEffect } from 'react'
import { downloadBlob, generateFilename, showToast, handlePasteImage, formatSize } from '../lib/utils'

export default function Watermark() {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [text, setText] = useState('© 张峻烨')
  const [position, setPosition] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center'>('bottom-right')
  const [opacity, setOpacity] = useState(0.5)
  const [fontSize, setFontSize] = useState(24)
  const [color, setColor] = useState('#ffffff')
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || !fileList[0]) return
    const file = fileList[0]
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        setImgEl(img)
        setResultDataUrl(null)
        const maxW = (wrapRef.current?.parentElement?.clientWidth || 600) - 60
        const scale = maxW / img.width
        setCanvasSize({ w: Math.round(img.width * scale), h: Math.round(img.height * scale) })
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
    if (!imgEl || !canvasRef.current) return
    const c = canvasRef.current
    c.width = canvasSize.w
    c.height = canvasSize.h
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(imgEl, 0, 0, c.width, c.height)

    // 绘制水印
    ctx.globalAlpha = opacity
    ctx.fillStyle = color
    ctx.font = `${fontSize}px 'Noto Sans SC', sans-serif`
    ctx.textBaseline = 'middle'

    const textMetrics = ctx.measureText(text)
    const textWidth = textMetrics.width
    const padding = 20
    let x = 0, y = 0

    switch (position) {
      case 'bottom-right':
        x = c.width - textWidth - padding
        y = c.height - padding
        break
      case 'bottom-left':
        x = padding
        y = c.height - padding
        break
      case 'top-right':
        x = c.width - textWidth - padding
        y = padding
        break
      case 'top-left':
        x = padding
        y = padding
        break
      case 'center':
        x = (c.width - textWidth) / 2
        y = c.height / 2
        break
    }

    ctx.fillText(text, x, y)
    ctx.globalAlpha = 1
  }, [imgEl, canvasSize, text, position, opacity, fontSize, color])

  const applyWatermark = () => {
    if (!canvasRef.current) return
    const dataUrl = canvasRef.current.toDataURL('image/png')
    setResultDataUrl(dataUrl)
    showToast('水印已添加')
  }

  const downloadResult = () => {
    if (!resultDataUrl) return
    const a = document.createElement('a')
    a.href = resultDataUrl
    a.download = generateFilename('watermark')
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
        <input id="fileInput" type="file" accept="image/*" onChange={e => handleFiles(e.target.files)} className="hidden" />
        <div className="text-3xl mb-3">💧</div>
        <div className="text-sm font-medium mb-1">点击或拖入图片</div>
        <div className="text-xs text-[var(--text2)]">Ctrl+V 粘贴</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 水印文字 */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-2 block">水印文字</label>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm focus:border-[var(--accent)] outline-none"
          placeholder="输入水印文字"
        />
      </div>

      {/* 位置选择 */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-2 block">位置</label>
        <div className="grid grid-cols-3 gap-2">
          {(['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPosition(p)}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition ${
                position === p
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
              }`}
            >
              {{ 'top-left': '左上', 'top-right': '右上', 'center': '居中', 'bottom-left': '左下', 'bottom-right': '右下' }[p]}
            </button>
          ))}
        </div>
      </div>

      {/* 透明度 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">透明度</label>
          <span className="text-xs font-mono text-[var(--text2)]">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={opacity}
          onChange={e => setOpacity(parseFloat(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      {/* 字体大小 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">字体大小</label>
          <span className="text-xs font-mono text-[var(--text2)]">{fontSize}px</span>
        </div>
        <input
          type="range"
          min="12"
          max="72"
          step="2"
          value={fontSize}
          onChange={e => setFontSize(parseInt(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      {/* 颜色 */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-2 block">颜色</label>
        <div className="flex gap-2">
          {['#ffffff', '#000000', '#ff0000', '#4f8ef7', '#7c5cfc'].map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-lg border-2 transition ${
                color === c ? 'border-[var(--accent)]' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="w-8 h-8 rounded-lg border-0 cursor-pointer"
          />
        </div>
      </div>

      {/* 画布预览 */}
      <div ref={wrapRef} className="relative inline-block max-w-full">
        <canvas ref={canvasRef} className="rounded-xl max-w-full" />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <button
          onClick={() => { setImgEl(null); setResultDataUrl(null) }}
          className="px-5 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--text)] transition text-sm font-medium"
        >
          重新上传
        </button>
        <button
          onClick={applyWatermark}
          className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] text-white font-bold text-sm"
        >
          应用水印
        </button>
      </div>

      {/* 结果 */}
      {resultDataUrl && (
        <div className="border-t border-[var(--border)] pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">结果</span>
            <button
              onClick={downloadResult}
              className="px-4 py-2 rounded-lg bg-[var(--success)] text-white text-xs font-semibold"
            >
              ↓ 下载
            </button>
          </div>
          <img src={resultDataUrl} className="max-w-full max-h-80 rounded-xl mx-auto" alt="结果" />
        </div>
      )}
    </div>
  )
}
