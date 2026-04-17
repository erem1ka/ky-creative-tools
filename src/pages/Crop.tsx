import React, { useState, useRef, useEffect } from 'react'
import { downloadBlob, generateFilename, showToast, handlePasteImage } from '../lib/utils'

type Ratio = 0 | 1 | 16/9 | 9/16 | 4/3 | 3/4

export default function Crop() {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [lockedRatio, setLockedRatio] = useState<Ratio>(0)
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const ratios: { label: string; value: Ratio }[] = [
    { label: '自由', value: 0 },
    { label: '1:1', value: 1 },
    { label: '16:9', value: 16/9 },
    { label: '9:16', value: 9/16 },
    { label: '4:3', value: 4/3 },
    { label: '3:4', value: 3/4 },
  ]

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
    if (!imgEl || !canvasRef.current || !overlayRef.current) return
    const src = canvasRef.current
    const ov = overlayRef.current
    const ctx = src.getContext('2d')!
    ctx.clearRect(0, 0, src.width, src.height)
    ctx.drawImage(imgEl, 0, 0, src.width, src.height)
  }, [imgEl, canvasSize])

  const drawOverlay = () => {
    if (!overlayRef.current) return
    const ctx = overlayRef.current.getContext('2d')!
    ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, overlayRef.current.width, overlayRef.current.height)
    ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
    ctx.strokeStyle = 'rgba(79,142,247,0.9)'
    ctx.lineWidth = 2
    ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
  }

  useEffect(() => { drawOverlay() }, [cropRect])

  const getPos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!overlayRef.current) return { x: 0, y: 0 }
    const rect = overlayRef.current.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0]?.clientX || 0 : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0]?.clientY || 0 : (e as React.MouseEvent).clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const onMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) e.preventDefault()
    const p = getPos(e)
    setIsDragging(true)
    setDragStart(p)
    setCropRect({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  const onMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return
    if ('touches' in e) e.preventDefault()
    const p = getPos(e)
    let w = p.x - dragStart.x
    let h = p.y - dragStart.y
    if (lockedRatio > 0) {
      const absW = Math.abs(w), absH = Math.abs(h)
      if (absW / absH > lockedRatio) {
        h = (w > 0 ? 1 : -1) * absW / lockedRatio
      } else {
        w = (h > 0 ? 1 : -1) * absH * lockedRatio
      }
    }
    setCropRect({
      x: w < 0 ? dragStart.x + w : dragStart.x,
      y: h < 0 ? dragStart.y + h : dragStart.y,
      w: Math.abs(w),
      h: Math.abs(h),
    })
  }

  const onMouseUp = () => setIsDragging(false)

  const doCrop = () => {
    if (!imgEl || cropRect.w < 2 || cropRect.h < 2) return
    const scale = imgEl.width / canvasSize.w
    const rx = Math.round(cropRect.x * scale)
    const ry = Math.round(cropRect.y * scale)
    const rw = Math.round(cropRect.w * scale)
    const rh = Math.round(cropRect.h * scale)
    const c = document.createElement('canvas')
    c.width = rw
    c.height = rh
    const ctx = c.getContext('2d')!
    ctx.drawImage(imgEl, rx, ry, rw, rh, 0, 0, rw, rh)
    const dataUrl = c.toDataURL('image/png')
    setResultDataUrl(dataUrl)
    showToast('裁剪完成')
  }

  const downloadResult = () => {
    if (!resultDataUrl) return
    const a = document.createElement('a')
    a.href = resultDataUrl
    a.download = generateFilename('crop')
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
        <div className="text-3xl mb-3">✂️</div>
        <div className="text-sm font-medium mb-1">点击或拖入图片</div>
        <div className="text-xs text-[var(--text2)]">Ctrl+V 粘贴</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 比例选择 */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mr-2">锁定比例：</span>
        {ratios.map(r => (
          <button
            key={String(r.value)}
            onClick={() => setLockedRatio(r.value)}
            className={`px-3 py-1.5 rounded-lg border font-mono text-xs font-bold transition ${
              lockedRatio === r.value
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
            }`}
          >
            {r.label}
          </button>
        ))}
        {cropRect.w > 1 && cropRect.h > 1 && (
          <span className="ml-auto text-xs font-mono text-[var(--text2)] bg-[var(--surface2)] px-3 py-1.5 rounded-lg border border-[var(--border)]">
            {Math.round(cropRect.w * (imgEl.width / canvasSize.w))} × {Math.round(cropRect.h * (imgEl.height / canvasSize.h))} px
          </span>
        )}
      </div>

      {/* 画布区域 */}
      <div ref={wrapRef} className="relative inline-block overflow-hidden cursor-crosshair max-w-full">
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          className="rounded-xl max-w-full"
        />
        <canvas
          ref={overlayRef}
          width={canvasSize.w}
          height={canvasSize.h}
          className="absolute top-0 left-0 w-full h-full"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onMouseDown}
          onTouchMove={onMouseMove}
          onTouchEnd={onMouseUp}
        />
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
          onClick={doCrop}
          disabled={cropRect.w < 2 || cropRect.h < 2}
          className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          裁剪
        </button>
      </div>

      {/* 结果 */}
      {resultDataUrl && (
        <div className="border-t border-[var(--border)] pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">裁剪结果</span>
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
