import { useState, useRef, useEffect } from 'react'
import { generateFilename, showToast, handlePasteImage } from '../lib/utils'
import { getSeedreamKey, getSeedKey, hasSeedreamKey, hasSeedKey, saveSeedreamKey, saveSeedKey, SEEDREAM_MODEL, SEED_MODEL } from '../lib/wanqing'

interface HistoryItem {
  id: string
  originalDataUrl: string
  resultDataUrl: string
  timestamp: number
  prompt: string
  ratio: string
}

const RATIOS = [
  { label: '3:4', w: 3, h: 4 },
  { label: '1:1', w: 1, h: 1 },
  { label: '4:3', w: 4, h: 3 },
  { label: '9:16', w: 9, h: 16 },
  { label: '16:9', w: 16, h: 9 },
]

const PRESETS = [
  { label: '自然风景', prompt: 'natural landscape, mountains, sky, clouds, high quality, ultra HD' },
  { label: '城市街景', prompt: 'urban street, buildings, modern city, detailed' },
  { label: '室内场景', prompt: 'interior, cozy home, soft lighting, detailed' },
  { label: '抽象背景', prompt: 'abstract art, gradient colors, soft transition, artistic' },
  { label: '自然纹理', prompt: 'natural texture, wood grain, stone, detailed surface' },
]

// API Keys & Models are now read from localStorage via wanqing.ts getters

export default function Outpaint() {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [seedreamKey, setSeedreamKey] = useState(getSeedreamKey())
  const [seedKey, setSeedKey] = useState(getSeedKey())
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [selectedRatio, setSelectedRatio] = useState(1)
  const [prompt, setPrompt] = useState('natural landscape, high quality, ultra HD, detailed')
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpg' | 'webp'>('png')
  const [loading, setLoading] = useState(false)
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('outpaint-history-v3')
      if (saved) setHistory(JSON.parse(saved))
    } catch {}
  }, [])

  // 调用 Seed-2.0-Pro 分析图片内容生成扩展提示词
  const analyzeImage = async (dataUrl: string) => {
    setAnalyzing(true)
    try {
      const base64 = dataUrl.split(',')[1]
      const mimeType = dataUrl.split(';')[0].split(':')[1]

      const res = await fetch('https://wanqing-api.corp.kuaishou.com/api/gateway/v1/endpoints/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getSeedKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: SEED_MODEL,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
              { type: 'text', text: 'Analyze this image content, style, color tone, environment. Generate a concise English prompt (under 20 words) for AI image extension. Return only the prompt.' },
            ],
          }],
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const generatedPrompt = data.choices?.[0]?.message?.content?.trim()
        if (generatedPrompt) {
          setPrompt(generatedPrompt)
          showToast('✨ 已自动分析图片内容')
        }
      }
    } catch {}
    setAnalyzing(false)
  }

  const handleFiles = (fileList: FileList | File[]) => {
    if (!fileList || !fileList[0]) return
    const file = fileList[0]
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        setImgEl(img)
        setResultDataUrl(null)
        const maxW = 480
        const maxH = 360
        const scale = Math.min(maxW / img.width, maxH / img.height, 1)
        setCanvasSize({ w: Math.round(img.width * scale), h: Math.round(img.height * scale) })
      }
      img.src = e.target!.result as string
      analyzeImage(e.target!.result as string)
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

  // 绘制原图预览（带扩展区域高亮）
  useEffect(() => {
    if (!imgEl || !canvasRef.current) return
    const c = canvasRef.current
    c.width = canvasSize.w
    c.height = canvasSize.h
    const ctx = c.getContext('2d')!
    
    const ratio = RATIOS[selectedRatio]
    if (ratio.w === 0) return
    
    const imgRatio = imgEl.width / imgEl.height
    const targetRatio = ratio.w / ratio.h
    
    let targetW: number, targetH: number
    let offsetX = 0, offsetY = 0
    
    if (imgRatio > targetRatio) {
      targetW = imgEl.width
      targetH = Math.round(imgEl.width / targetRatio)
      offsetY = Math.round((targetH - imgEl.height) / 2)
    } else {
      targetH = imgEl.height
      targetW = Math.round(imgEl.height * targetRatio)
      offsetX = Math.round((targetW - imgEl.width) / 2)
    }
    
    const scale = canvasSize.w / targetW
    const displayH = Math.round(targetH * scale)
    c.height = displayH
    
    ctx.fillStyle = 'rgba(255, 76, 139, 0.2)'
    ctx.fillRect(0, 0, c.width, displayH)
    
    const displayOffsetX = Math.round(offsetX * scale)
    const displayOffsetY = Math.round(offsetY * scale)
    const displayImgW = Math.round(imgEl.width * scale)
    const displayImgH = Math.round(imgEl.height * scale)
    
    ctx.drawImage(imgEl, displayOffsetX, displayOffsetY, displayImgW, displayImgH)
    
    ctx.strokeStyle = '#ff4c8b'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.strokeRect(displayOffsetX, displayOffsetY, displayImgW, displayImgH)
  }, [imgEl, canvasSize, selectedRatio])

  const runOutpaint = async () => {
    if (!hasSeedreamKey()) { showToast('请先在上方配置 Seedream API Key', 'error'); return }
    if (!hasSeedKey()) { showToast('请先在上方配置 Seed API Key', 'error'); return }
    if (!imgEl) {
      showToast('请先上传图片', 'error')
      return
    }

    setLoading(true)
    try {
      const ratio = RATIOS[selectedRatio]
      if (ratio.w === 0) {
        showToast('请选择有效的比例', 'error')
        setLoading(false)
        return
      }
      
      const imgRatio = imgEl.width / imgEl.height
      const targetRatio = ratio.w / ratio.h
      
      let targetW: number, targetH: number
      if (imgRatio > targetRatio) {
        targetW = imgEl.width
        targetH = Math.round(imgEl.width / targetRatio)
      } else {
        targetH = imgEl.height
        targetW = Math.round(imgEl.height * targetRatio)
      }

      const maxSize = Math.max(targetW, targetH)
      const size = maxSize <= 1024 ? '2k' : maxSize <= 2048 ? '2k' : '3k'

      const response = await fetch('https://wanqing-api.corp.kuaishou.com/api/gateway/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getSeedreamKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: SEEDREAM_MODEL,
          prompt: prompt || 'natural landscape, high quality, ultra HD, detailed',
          size,
          response_format: 'url',
          watermark: false,
          stream: false,
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(err.slice(0, 200))
      }

      const result = await response.json()
      const imageUrl = result.data?.[0]?.url

      if (!imageUrl) throw new Error('未返回图片 URL')

      const imgRes = await fetch(imageUrl)
      const blob = await imgRes.blob()
      const bgDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })

      const outpaintCanvas = document.createElement('canvas')
      outpaintCanvas.width = targetW
      outpaintCanvas.height = targetH
      const ctx = outpaintCanvas.getContext('2d')!

      const bgImg = new Image()
      bgImg.crossOrigin = 'anonymous'
      await new Promise<void>((resolve) => {
        bgImg.onload = () => resolve()
        bgImg.src = bgDataUrl
      })

      const bgRatio = bgImg.width / bgImg.height
      let sx = 0, sy = 0, sw = bgImg.width, sh = bgImg.height
      if (bgRatio > targetRatio) {
        sw = bgImg.height * targetRatio
        sx = (bgImg.width - sw) / 2
      } else {
        sh = bgImg.width / targetRatio
        sy = (bgImg.height - sh) / 2
      }
      ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, targetW, targetH)

      const offsetX = Math.round((targetW - imgEl.width) / 2)
      const offsetY = Math.round((targetH - imgEl.height) / 2)
      ctx.drawImage(imgEl, offsetX, offsetY)

      const mimeType = outputFormat === 'jpg' ? 'image/jpeg' : outputFormat === 'webp' ? 'image/webp' : 'image/png'
      const quality = outputFormat === 'jpg' ? 0.92 : undefined
      const finalDataUrl = outpaintCanvas.toDataURL(mimeType, quality)
      
      setResultDataUrl(finalDataUrl)

      const item: HistoryItem = {
        id: Date.now().toString(),
        originalDataUrl: imgEl.src,
        resultDataUrl: finalDataUrl,
        timestamp: Date.now(),
        prompt,
        ratio: ratio.label,
      }
      const newHistory = [item, ...history].slice(0, 20)
      setHistory(newHistory)
      localStorage.setItem('outpaint-history-v3', JSON.stringify(newHistory))

      showToast('生成完成')
    } catch (err: any) {
      showToast(err.message || '处理失败', 'error')
    }

    setLoading(false)
  }

  const downloadResult = () => {
    if (!resultDataUrl) return
    const a = document.createElement('a')
    a.href = resultDataUrl
    a.download = generateFilename('ratio-modify', outputFormat)
    a.click()
    showToast('下载成功')
  }

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setPrompt(preset.prompt)
    setShowPresets(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        height: '56px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(10,10,18,0.94)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        gap: '16px',
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '9px', textDecoration: 'none' }}>
          <img src="/logo.webp" alt="快影" width="24" height="24" style={{ objectFit: 'contain' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, background: 'linear-gradient(90deg,#ff4c8b,#ff8c3d)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>快影</span>
        </a>
        <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.08)' }} />
        <span style={{ fontSize: '13px', color: 'var(--text2)' }}>📐 比例修改</span>
        <a href="/" style={{
          marginLeft: 'auto',
          fontSize: '12px',
          color: 'var(--text2)',
          textDecoration: 'none',
          padding: '5px 12px',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.05)',
        }}>
          ← 返回工具集
        </a>
      </header>

      {/* API Key 配置 */}
      <div style={{
        padding: '12px 32px',
        background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)' }}>⚙️ API Key：</span>
        <input
          type="password"
          value={seedreamKey}
          onChange={e => setSeedreamKey(e.target.value)}
          placeholder="Seedream Key（图片生成）"
          style={{ width: '200px', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', fontSize: '11px', fontFamily: 'monospace' }}
        />
        <input
          type="password"
          value={seedKey}
          onChange={e => setSeedKey(e.target.value)}
          placeholder="Seed Key（图片分析）"
          style={{ width: '200px', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', fontSize: '11px', fontFamily: 'monospace' }}
        />
        <button
          onClick={() => { saveSeedreamKey(seedreamKey); saveSeedKey(seedKey); showToast('API Key 已保存') }}
          style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >保存</button>
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* 左侧控制面板 */}
        <aside style={{
          width: '280px',
          borderRight: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(255,255,255,0.02)',
          padding: '24px 20px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}>
          {/* 目标比例 */}
          <div>
            <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: '12px', textTransform: 'uppercase' }}>
              目标比例
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {RATIOS.map((r, i) => (
                <button
                  key={r.label}
                  onClick={() => setSelectedRatio(i)}
                  style={{
                    padding: '10px 0',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    background: selectedRatio === i ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                    color: selectedRatio === i ? '#fff' : 'var(--text2)',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* 场景预设 */}
          <div>
            <button
              onClick={() => setShowPresets(!showPresets)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--text2)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                textTransform: 'uppercase',
              }}
            >
              <span>场景预设</span>
              <span>{showPresets ? '−' : '+'}</span>
            </button>
            {showPresets && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text)',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 提示词 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text2)', textTransform: 'uppercase' }}>
                场景描述
              </h3>
              {analyzing && (
                <span style={{ fontSize: '10px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    width: '10px', height: '10px',
                    border: '2px solid rgba(255,76,139,0.3)',
                    borderTop: '2px solid var(--accent)',
                    borderRadius: '50%',
                    animation: 'pulse 1s linear infinite',
                  }} />
                  AI 分析中
                </span>
              )}
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="描述扩展区域的场景..."
              rows={3}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text)',
                fontSize: '12px',
                resize: 'none',
                outline: 'none',
              }}
            />
            {imgEl && !analyzing && (
              <button
                onClick={() => analyzeImage(imgEl.src)}
                style={{
                  marginTop: '8px',
                  fontSize: '11px',
                  color: 'var(--accent)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ✨ 重新分析图片
              </button>
            )}
          </div>

          {/* 输出格式 */}
          <div>
            <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: '8px', textTransform: 'uppercase' }}>
              输出格式
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['png', 'jpg', 'webp'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setOutputFormat(f)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    background: outputFormat === f ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                    color: outputFormat === f ? '#fff' : 'var(--text2)',
                    textTransform: 'uppercase',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* 生成按钮 */}
          <button
            onClick={runOutpaint}
            disabled={loading || !imgEl || !hasSeedreamKey() || !hasSeedKey()}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
              border: 'none',
              cursor: loading || !imgEl || !hasSeedreamKey() || !hasSeedKey() ? 'not-allowed' : 'pointer',
              opacity: loading || !imgEl || !hasSeedreamKey() || !hasSeedKey() ? 0.5 : 1,
            }}
          >
            {loading ? '生成中...' : '生成'}
          </button>
          {!hasSeedreamKey() && <p style={{ fontSize: '10px', color: '#f87171', textAlign: 'center', marginTop: '8px' }}>⚠️ 请先在上方配置 Seedream API Key</p>}
          {!hasSeedKey() && <p style={{ fontSize: '10px', color: '#f87171', textAlign: 'center', marginTop: '4px' }}>⚠️ 请先在上方配置 Seed API Key</p>}
        </aside>

        {/* 右侧主区域 */}
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {!imgEl ? (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => document.getElementById('fileInputOp')?.click()}
              style={{
                height: '400px',
                border: '2px dashed rgba(255,255,255,0.08)',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <input
                id="fileInputOp"
                type="file"
                accept="image/*"
                onChange={e => e.target.files && handleFiles(e.target.files)}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🖼️</div>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>点击或拖入图片</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>支持 JPG / PNG / WebP，Ctrl+V 粘贴</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' }}>
                    原图 + 扩展预览（虚线框为原图）
                  </div>
                  <canvas ref={canvasRef} style={{ borderRadius: '12px', maxWidth: '100%' }} />
                </div>
                {resultDataUrl && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text2)' }}>生成结果</span>
                      <button
                        onClick={downloadResult}
                        style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        ↓ 下载
                      </button>
                    </div>
                    <img src={resultDataUrl} style={{ maxWidth: '480px', borderRadius: '12px' }} alt="结果" />
                  </div>
                )}
              </div>

              <button
                onClick={() => { setImgEl(null); setResultDataUrl(null) }}
                style={{
                  fontSize: '12px',
                  color: 'var(--text2)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                重新上传图片
              </button>
            </div>
          )}
        </main>

        {/* 历史记录侧边栏 */}
        {showHistory && (
          <aside style={{
            width: '240px',
            borderLeft: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(255,255,255,0.02)',
            padding: '20px',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text2)', textTransform: 'uppercase' }}>
                历史记录
              </h3>
              <button onClick={() => setShowHistory(false)} style={{ fontSize: '12px', color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
            </div>
            {history.length > 0 ? (
              <>
                <button
                  onClick={() => { setHistory([]); localStorage.removeItem('outpaint-history-v3') }}
                  style={{ fontSize: '10px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '12px' }}
                >
                  清空历史记录
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {history.map(item => (
                    <div
                      key={item.id}
                      onClick={() => setResultDataUrl(item.resultDataUrl)}
                      style={{
                        position: 'relative',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                      }}
                    >
                      <img src={item.resultDataUrl} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} alt="" />
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0,
                        transition: 'opacity 0.15s',
                      }}>
                        <span style={{ fontSize: '10px', color: '#fff' }}>{item.ratio}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>暂无历史记录</div>
            )}
          </aside>
        )}
      </div>

      {/* 历史记录按钮 */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'var(--accent)',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(255,76,139,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
        }}
      >
        📚
      </button>
    </div>
  )
}
