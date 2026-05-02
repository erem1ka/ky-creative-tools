import { useState, useRef, useEffect, useCallback } from 'react'
import { showToast, generateFilename } from '../lib/utils'
import { inpaint, loadLamaModel, isModelCached } from '../lib/lama-inpaint'

type ToolMode = 'brush' | 'eraser'
type ProcessingPhase = 'idle' | 'loading-model' | 'inpainting'

export default function WatermarkRemover() {
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [imgName, setImgName] = useState('image')
  const [mode, setMode] = useState<ToolMode>('brush')
  const [brushSize, setBrushSize] = useState(20)
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>('idle')
  const [modelProgress, setModelProgress] = useState(0) // 0-100%
  const [resultUrl, setResultUrl] = useState<string | null>(null)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const canvasWrapperRef = useRef<HTMLDivElement>(null)
  const [canvasDisplaySize, setCanvasDisplaySize] = useState({ w: 0, h: 0 })
  const [modelReady, setModelReady] = useState(false)

  // 预检查模型是否已缓存
  useEffect(() => {
    isModelCached().then(cached => {
      if (cached) setModelReady(true)
    })
  }, [])

  // When image loads, setup canvases
  useEffect(() => {
    if (!imgSrc) return
    const img = new Image()
    img.onload = () => {
      imgRef.current = img

      const main = mainCanvasRef.current!
      main.width = img.width
      main.height = img.height

      const ctx = main.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      const mask = maskCanvasRef.current!
      mask.width = img.width
      mask.height = img.height
      mask.getContext('2d')!.clearRect(0, 0, mask.width, mask.height)

      fitCanvas(img.width, img.height)
    }
    img.src = imgSrc
  }, [imgSrc])

  const fitCanvas = (imgW: number, imgH: number) => {
    const wrapper = canvasWrapperRef.current
    if (!wrapper) return
    const maxW = wrapper.clientWidth
    const maxH = wrapper.clientHeight
    const scale = Math.min(maxW / imgW, maxH / imgH, 1)
    setCanvasDisplaySize({ w: Math.round(imgW * scale), h: Math.round(imgH * scale) })
  }

  // Resize observer for canvas wrapper
  useEffect(() => {
    if (!imgRef.current) return
    const wrapper = canvasWrapperRef.current
    if (!wrapper) return
    const observer = new ResizeObserver(() => {
      fitCanvas(imgRef.current!.width, imgRef.current!.height)
    })
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [imgSrc])

  // Draw mask overlay on main canvas
  const redraw = useCallback(() => {
    if (!mainCanvasRef.current || !maskCanvasRef.current || !imgRef.current) return
    const ctx = mainCanvasRef.current.getContext('2d')!
    ctx.clearRect(0, 0, mainCanvasRef.current.width, mainCanvasRef.current.height)
    ctx.drawImage(imgRef.current, 0, 0)

    // Semi-transparent red mask overlay
    const maskData = maskCanvasRef.current.getContext('2d')!.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
    const overlay = ctx.getImageData(0, 0, mainCanvasRef.current.width, mainCanvasRef.current.height)
    for (let i = 0; i < maskData.data.length; i += 4) {
      if (maskData.data[i + 3] > 0) {
        overlay.data[i] = 255
        overlay.data[i + 1] = 76
        overlay.data[i + 2] = 139
        overlay.data[i + 3] = Math.min(maskData.data[i + 3] + 100, 160)
      }
    }
    ctx.putImageData(overlay, 0, 0)
  }, [])

  // Get canvas pixel coordinates from pointer event
  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = mainCanvasRef.current!
    const rect = canvas.getBoundingClientRect()
    let clientX: number, clientY: number
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }, [])

  // Draw stroke on mask
  const drawStroke = useCallback((x: number, y: number) => {
    const mctx = maskCanvasRef.current?.getContext('2d')
    if (!mctx) return

    if (mode === 'brush') {
      mctx.globalCompositeOperation = 'source-over'
      mctx.fillStyle = '#ff4c8b'
      mctx.strokeStyle = '#ff4c8b'
    } else {
      mctx.globalCompositeOperation = 'destination-out'
      mctx.fillStyle = '#000'
      mctx.strokeStyle = '#000'
    }

    const r = brushSize / 2
    mctx.beginPath()
    mctx.arc(x, y, r, 0, Math.PI * 2)
    mctx.fill()

    if (lastPos.current) {
      mctx.lineWidth = brushSize
      mctx.lineCap = 'round'
      mctx.lineJoin = 'round'
      mctx.beginPath()
      mctx.moveTo(lastPos.current.x, lastPos.current.y)
      mctx.lineTo(x, y)
      mctx.stroke()
    }
    lastPos.current = { x, y }
  }, [mode, brushSize])

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (resultUrl) return
    e.preventDefault()
    isDrawing.current = true
    lastPos.current = null
    const pos = getCanvasPos(e)
    drawStroke(pos.x, pos.y)
    redraw()
  }, [getCanvasPos, drawStroke, redraw, resultUrl])

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return
    e.preventDefault()
    const pos = getCanvasPos(e)
    drawStroke(pos.x, pos.y)
    redraw()
  }, [getCanvasPos, drawStroke, redraw])

  const handlePointerUp = useCallback(() => {
    isDrawing.current = false
    lastPos.current = null
  }, [])

  // ===== LaMa Inpainting =====
  const removeWatermark = useCallback(async () => {
    if (!imgRef.current || !maskCanvasRef.current || !mainCanvasRef.current) return

    try {
      // Phase 1: 加载模型
      setProcessingPhase('loading-model')
      setModelProgress(0)

      await loadLamaModel((loaded, total) => {
        setModelProgress(Math.min(100, Math.round(loaded / total * 100)))
      })
      setModelReady(true)

      // 准备原图 canvas（不含 mask overlay，纯原图）
      const origCanvas = document.createElement('canvas')
      origCanvas.width = imgRef.current.width
      origCanvas.height = imgRef.current.height
      origCanvas.getContext('2d')!.drawImage(imgRef.current, 0, 0)

      // 准备 mask canvas（清除 overlay，取纯 mask）
      const pureMaskCanvas = document.createElement('canvas')
      pureMaskCanvas.width = maskCanvasRef.current.width
      pureMaskCanvas.height = maskCanvasRef.current.height
      const pureMaskCtx = pureMaskCanvas.getContext('2d')!
      pureMaskCtx.drawImage(maskCanvasRef.current, 0, 0)

      // Phase 2: 推理
      setProcessingPhase('inpainting')

      const result = await inpaint({
        imageCanvas: origCanvas,
        maskCanvas: pureMaskCanvas,
      })

      // 将结果画到 main canvas
      const mainCtx = mainCanvasRef.current!.getContext('2d')!
      mainCtx.clearRect(0, 0, mainCanvasRef.current!.width, mainCanvasRef.current!.height)
      mainCtx.drawImage(result.resultCanvas, 0, 0)

      mainCanvasRef.current!.toBlob(blob => {
        if (blob) {
          setResultUrl(URL.createObjectURL(blob))
          setProcessingPhase('idle')
          showToast('✨ AI 去水印完成')
        }
      }, 'image/png')
    } catch (err: any) {
      setProcessingPhase('idle')
      showToast(err.message || '处理失败', 'error')
    }
  }, [])

  const clearMask = useCallback(() => {
    if (!maskCanvasRef.current || !imgRef.current || !mainCanvasRef.current) return
    maskCanvasRef.current.getContext('2d')!.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
    setResultUrl(null)
    redraw()
  }, [redraw])

  const downloadResult = useCallback(() => {
    if (!resultUrl) return
    const a = document.createElement('a')
    a.href = resultUrl
    a.download = generateFilename(imgName, 'png')
    a.click()
  }, [resultUrl, imgName])

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImgName(file.name.replace(/\.[^.]+$/, ''))
    const reader = new FileReader()
    reader.onload = () => {
      setImgSrc(reader.result as string)
      setResultUrl(null)
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            setImgName(file.name.replace(/\.[^.]+$/, '') || 'pasted')
            const reader = new FileReader()
            reader.onload = () => { setImgSrc(reader.result as string); setResultUrl(null) }
            reader.readAsDataURL(file)
          }
        }
      }
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])

  const isProcessing = processingPhase !== 'idle'

  // ===== RENDER =====

  // Upload screen
  if (!imgSrc) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '320px', gap: '20px',
      }}>
        <div
          onClick={() => document.getElementById('wr-upload')?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
          onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
          onDrop={e => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file && file.type.startsWith('image/')) {
              setImgName(file.name.replace(/\.[^.]+$/, ''))
              const reader = new FileReader()
              reader.onload = () => { setImgSrc(reader.result as string); setResultUrl(null) }
              reader.readAsDataURL(file)
            }
          }}
          style={{
            width: '100%', maxWidth: '480px', padding: '48px 40px',
            borderRadius: '16px',
            border: '2px dashed rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.03)',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { const s = (e.currentTarget as HTMLElement).style; s.borderColor = 'var(--accent)'; s.background = 'rgba(255,76,139,0.05)' }}
          onMouseLeave={e => { const s = (e.currentTarget as HTMLElement).style; s.borderColor = 'rgba(255,255,255,0.1)'; s.background = 'rgba(255,255,255,0.03)' }}
        >
          <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.6, filter: 'grayscale(0.3)' }}>🧹</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
            上传带水印的图片
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.6 }}>
            点击上传 · 拖拽放入 · Ctrl+V 粘贴
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '12px', opacity: 0.7 }}>
            使用 AI (LaMa) 端侧推理，图片不会上传到服务器
          </div>
          <input id="wr-upload" type="file" accept="image/*" onChange={handleUpload} hidden />
        </div>
      </div>
    )
  }

  // Editor screen
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', minHeight: '500px',
      borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* ===== Top Bar ===== */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '0 16px', height: '44px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.02)', gap: '8px',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.05em' }}>
          {imgName}
        </div>
        {modelReady && !isProcessing && (
          <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(62,207,142,0.15)', color: '#3ecf8e', fontWeight: 600 }}>
            AI Ready
          </span>
        )}
        <div style={{ flex: 1 }} />
        {!resultUrl && !isProcessing && (
          <button
            onClick={clearMask}
            style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.08)', color: 'var(--text2)' }}
          >清除选区</button>
        )}
        {resultUrl && (
          <>
            <button
              onClick={downloadResult}
              style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', background: 'var(--success)', color: '#fff' }}
            >↓ 下载</button>
            <button
              onClick={() => { setImgSrc(null); setResultUrl(null) }}
              style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.08)', color: 'var(--text2)' }}
            >重新上传</button>
          </>
        )}
      </div>

      {/* ===== Main Area: Sidebar + Canvas ===== */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ===== Left Sidebar: Tools ===== */}
        <div style={{
          width: '56px', borderRight: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '12px 0', gap: '4px',
        }}>
          {/* Brush tool */}
          <button
            onClick={() => setMode('brush')}
            style={{
              width: '40px', height: '40px', borderRadius: '8px',
              background: mode === 'brush' ? 'rgba(255,76,139,0.2)' : 'transparent',
              border: mode === 'brush' ? '1px solid rgba(255,76,139,0.4)' : '1px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', cursor: resultUrl || isProcessing ? 'default' : 'pointer',
              opacity: resultUrl || isProcessing ? 0.4 : 1,
              transition: 'all 0.15s',
            }}
            title="标记水印"
          >🖌️</button>

          {/* Eraser tool */}
          <button
            onClick={() => setMode('eraser')}
            style={{
              width: '40px', height: '40px', borderRadius: '8px',
              background: mode === 'eraser' ? 'rgba(255,255,255,0.15)' : 'transparent',
              border: mode === 'eraser' ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', cursor: resultUrl || isProcessing ? 'default' : 'pointer',
              opacity: resultUrl || isProcessing ? 0.4 : 1,
              transition: 'all 0.15s',
            }}
            title="清除选区"
          >◻️</button>

          {/* Divider */}
          <div style={{ width: '28px', height: '1px', background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />

          {/* Brush size preview */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            padding: '4px 4px',
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '6px',
              background: 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: Math.min(brushSize, 24) + 'px',
                height: Math.min(brushSize, 24) + 'px',
                borderRadius: '50%',
                background: mode === 'brush' ? 'rgba(255,76,139,0.6)' : 'rgba(255,255,255,0.4)',
                transition: 'all 0.15s',
              }} />
            </div>
            <span style={{ fontSize: '9px', color: 'var(--text2)', fontFamily: 'monospace' }}>{brushSize}px</span>
          </div>
        </div>

        {/* ===== Canvas Area ===== */}
        <div
          ref={canvasWrapperRef}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0a0a0a',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <canvas
            ref={mainCanvasRef}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            style={{
              width: canvasDisplaySize.w || 'auto',
              height: canvasDisplaySize.h || 'auto',
              maxWidth: '100%',
              maxHeight: '100%',
              display: 'block',
              cursor: resultUrl || isProcessing ? 'default' : (mode === 'brush' ? 'crosshair' : 'cell'),
              boxShadow: '0 0 40px rgba(0,0,0,0.5)',
            }}
          />
          <canvas ref={maskCanvasRef} style={{ display: 'none' }} />

          {/* Processing overlay */}
          {isProcessing && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '16px',
              borderRadius: '0',
            }}>
              <div style={{ fontSize: '48px', opacity: 0.8 }}>
                {processingPhase === 'loading-model' ? '🧠' : '✨'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                {processingPhase === 'loading-model' ? '加载 AI 模型...' : 'AI 修复中...'}
              </div>
              {processingPhase === 'loading-model' && (
                <div style={{ width: '200px' }}>
                  <div style={{
                    height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: '2px',
                      background: 'linear-gradient(90deg, #ff4c8b, #ff8c3d)',
                      width: modelProgress + '%',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '6px', textAlign: 'center' }}>
                    {modelProgress < 100 ? `${modelProgress}% · 首次使用需下载 ~134MB 模型` : '模型加载完成，准备推理...'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== Bottom Bar ===== */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '0 16px', height: '48px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.02)', gap: '16px',
      }}>
        {/* Brush size slider */}
        {!resultUrl && !isProcessing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text2)' }}>笔刷</span>
            <input
              type="range" min={3} max={80} value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              style={{ width: '120px', accentColor: 'var(--accent)', height: '3px' }}
            />
            <span style={{ fontSize: '10px', color: 'var(--text2)', fontFamily: 'monospace', minWidth: '28px' }}>
              {brushSize}px
            </span>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Primary action */}
        {!resultUrl && !isProcessing && (
          <button
            onClick={removeWatermark}
            style={{
              padding: '8px 28px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #ff4c8b, #ff8c3d)',
              color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(255,76,139,0.25)',
            }}
          >✨ AI 去水印</button>
        )}

        {isProcessing && (
          <button
            style={{
              padding: '8px 28px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.08)',
              color: 'var(--text2)', fontSize: '13px', fontWeight: 700, border: 'none',
              cursor: 'not-allowed', opacity: 0.5,
            }}
          >
            {processingPhase === 'loading-model' ? '⏳ 加载模型...' : '⏳ 修复中...'}
          </button>
        )}

        {resultUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 600 }}>✓ 完成</span>
            <button
              onClick={downloadResult}
              style={{
                padding: '8px 28px', borderRadius: '8px',
                background: 'var(--success)', color: '#fff', fontSize: '13px', fontWeight: 700,
                border: 'none', cursor: 'pointer',
                boxShadow: '0 2px 12px rgba(62,207,142,0.25)',
              }}
            >↓ 下载结果</button>
          </div>
        )}
      </div>
    </div>
  )
}