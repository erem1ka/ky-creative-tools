import React, { useState, useRef, useEffect } from 'react'
import { downloadBlob, generateFilename, showToast, handlePasteImage, formatSize } from '../lib/utils'

type Provider = 'fal' | 'seedream'

interface HistoryItem {
  id: string
  originalDataUrl: string
  resultDataUrl: string
  provider: Provider
  timestamp: number
  prompt: string
}

export default function Outpaint() {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [pads, setPads] = useState({ left: 0, right: 0, top: 0, bottom: 0 })
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<Provider>('fal')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [savedKeys, setSavedKeys] = useState<{ [key: string]: string }>({})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // 加载历史
  useEffect(() => {
    try {
      const saved = localStorage.getItem('outpaint-history')
      if (saved) setHistory(JSON.parse(saved))
      const keys = localStorage.getItem('outpaint-keys')
      if (keys) setSavedKeys(JSON.parse(keys))
    } catch {}
  }, [])

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
        const maxW = ((wrapRef.current?.parentElement?.clientWidth || 600) - 60) / 2
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

    // 绘制扩展区域（灰色）
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, c.width, c.height)

    // 绘制原图
    const imgW = canvasSize.w - pads.left - pads.right
    const imgH = canvasSize.h - pads.top - pads.bottom
    ctx.drawImage(imgEl, pads.left, pads.top, imgW, imgH)

    // 绘制边框
    ctx.strokeStyle = 'rgba(79,142,247,0.5)'
    ctx.lineWidth = 1
    ctx.strokeRect(pads.left, pads.top, imgW, imgH)
  }, [imgEl, canvasSize, pads])

  const handlePadChange = (side: keyof typeof pads, value: number) => {
    setPads(p => ({ ...p, [side]: value }))
  }

  const saveApiKey = (p: Provider) => {
    if (!apiKey.trim()) return
    const keys = { ...savedKeys, [p]: apiKey.trim() }
    setSavedKeys(keys)
    localStorage.setItem('outpaint-keys', JSON.stringify(keys))
    showToast('API Key 已保存')
  }

  const clearApiKey = (p: Provider) => {
    const keys = { ...savedKeys }
    delete keys[p]
    setSavedKeys(keys)
    setApiKey('')
    localStorage.setItem('outpaint-keys', JSON.stringify(keys))
  }

  const runOutpaint = async () => {
    if (!imgEl || !savedKeys[provider]) {
      showToast('请先保存 API Key', 'error')
      return
    }

    setLoading(true)
    try {
      // 生成目标尺寸的原图 data URL
      const tempCanvas = document.createElement('canvas')
      const scale = imgEl.width / (canvasSize.w - pads.left - pads.right)
      const targetW = Math.round(imgEl.width + (pads.left + pads.right) * scale)
      const targetH = Math.round(imgEl.height + (pads.top + pads.bottom) * scale)
      tempCanvas.width = targetW
      tempCanvas.height = targetH
      const ctx = tempCanvas.getContext('2d')!
      ctx.drawImage(imgEl, pads.left * scale, pads.top * scale, imgEl.width, imgEl.height, 0, 0, targetW, targetH)
      const imageData = tempCanvas.toDataURL('image/png')

      // 调用后端 API
      const response = await fetch('/api/outpaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: savedKeys[provider],
          imageData,
          padLeft: Math.round(pads.left * scale),
          padRight: Math.round(pads.right * scale),
          padTop: Math.round(pads.top * scale),
          padBottom: Math.round(pads.bottom * scale),
          targetW,
          targetH,
          prompt,
          creativity: 0.7,
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(err.slice(0, 200))
      }

      const result = await response.json()
      setResultDataUrl(result.imageData)

      // 保存到历史
      const item: HistoryItem = {
        id: Date.now().toString(),
        originalDataUrl: imgEl.src,
        resultDataUrl: result.imageData,
        provider,
        timestamp: Date.now(),
        prompt,
      }
      const newHistory = [item, ...history].slice(0, 20)
      setHistory(newHistory)
      localStorage.setItem('outpaint-history', JSON.stringify(newHistory))

      showToast('扩展完成')
    } catch (err: any) {
      showToast(err.message || '处理失败', 'error')
    }

    setLoading(false)
  }

  const downloadResult = () => {
    if (!resultDataUrl) return
    const a = document.createElement('a')
    a.href = resultDataUrl
    a.download = generateFilename('outpaint')
    a.click()
    showToast('下载成功')
  }

  if (!imgEl) {
    return (
      <div className="space-y-6">
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-[var(--border)] rounded-xl p-10 text-center cursor-pointer hover:border-[var(--accent)] transition bg-[var(--surface2)]"
          onClick={() => document.getElementById('fileInput')?.click()}
        >
          <input id="fileInput" type="file" accept="image/*" onChange={e => handleFiles(e.target.files)} className="hidden" />
          <div className="text-3xl mb-3">🖼️</div>
          <div className="text-sm font-medium mb-1">点击或拖入图片</div>
          <div className="text-xs text-[var(--text2)]">Ctrl+V 粘贴</div>
        </div>

        {/* API Key 设置 */}
        <div className="border-t border-[var(--border)] pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">API Key 设置</span>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-xs text-[var(--accent)] hover:underline"
            >
              {showSettings ? '收起' : '展开'}
            </button>
          </div>
          {showSettings && (
            <div className="space-y-4">
              {/* FAL */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold">FAL.AI (FLUX)</span>
                  {savedKeys.fal && <span className="text-[10px] text-[var(--success)]">✓ 已保存</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={savedKeys.fal ? '' : ''}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="FAL Key"
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-xs focus:border-[var(--accent)] outline-none"
                  />
                  <button onClick={() => saveApiKey('fal')} className="px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold">保存</button>
                  {savedKeys.fal && <button onClick={() => clearApiKey('fal')} className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] text-xs">清除</button>}
                </div>
              </div>
              {/* Seedream */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold">Seedream (火山引擎)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--danger)]/20 text-[var(--danger)]">国内</span>
                  {savedKeys.seedream && <span className="text-[10px] text-[var(--success)]">✓ 已保存</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="Seedream API Key"
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-xs focus:border-[var(--accent)] outline-none"
                  />
                  <button onClick={() => saveApiKey('seedream')} className="px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold">保存</button>
                  {savedKeys.seedream && <button onClick={() => clearApiKey('seedream')} className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] text-xs">清除</button>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 提供商选择 */}
      <div className="flex gap-2">
        <button
          onClick={() => setProvider('fal')}
          className={`flex-1 py-2.5 rounded-lg border font-semibold text-sm transition ${
            provider === 'fal'
              ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
          }`}
        >
          FAL.AI
        </button>
        <button
          onClick={() => setProvider('seedream')}
          className={`flex-1 py-2.5 rounded-lg border font-semibold text-sm transition ${
            provider === 'seedream'
              ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
          }`}
        >
          Seedream
        </button>
      </div>

      {/* 扩展设置 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] text-[var(--text2)] mb-1 block">左侧扩展 (px)</label>
          <input
            type="number"
            value={pads.left}
            onChange={e => handlePadChange('left', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm font-mono focus:border-[var(--accent)] outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text2)] mb-1 block">右侧扩展 (px)</label>
          <input
            type="number"
            value={pads.right}
            onChange={e => handlePadChange('right', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm font-mono focus:border-[var(--accent)] outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text2)] mb-1 block">上方扩展 (px)</label>
          <input
            type="number"
            value={pads.top}
            onChange={e => handlePadChange('top', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm font-mono focus:border-[var(--accent)] outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text2)] mb-1 block">下方扩展 (px)</label>
          <input
            type="number"
            value={pads.bottom}
            onChange={e => handlePadChange('bottom', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm font-mono focus:border-[var(--accent)] outline-none"
          />
        </div>
      </div>

      {/* 提示词 */}
      <div>
        <label className="text-[10px] text-[var(--text2)] mb-1 block">场景提示词（可选）</label>
        <input
          type="text"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="例如：sunset, mountains, forest..."
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm focus:border-[var(--accent)] outline-none"
        />
      </div>

      {/* 画布预览 */}
      <div ref={wrapRef} className="flex gap-4">
        <div className="flex-1 relative">
          <canvas ref={canvasRef} className="rounded-xl max-w-full" />
        </div>
      </div>

      {/* 操作按钮 */}
      <button
        onClick={runOutpaint}
        disabled={loading || !savedKeys[provider]}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] text-white font-bold text-sm disabled:opacity-50"
      >
        {loading ? '处理中...' : '开始扩展'}
      </button>

      {/* 结果 */}
      {resultDataUrl && (
        <div className="border-t border-[var(--border)] pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">扩展结果</span>
            <button
              onClick={downloadResult}
              className="px-4 py-2 rounded-lg bg-[var(--success)] text-white text-xs font-semibold"
            >
              ↓ 下载
            </button>
          </div>
          <img src={resultDataUrl} className="max-w-full rounded-xl mx-auto" alt="结果" />
        </div>
      )}

      {/* 历史 */}
      {history.length > 0 && (
        <div className="border-t border-[var(--border)] pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">历史记录</span>
            <button
              onClick={() => { setHistory([]); localStorage.removeItem('outpaint-history') }}
              className="text-[10px] text-[var(--danger)] hover:underline"
            >
              清空
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {history.slice(0, 6).map(item => (
              <div
                key={item.id}
                className="relative rounded-lg overflow-hidden cursor-pointer group"
                onClick={() => setResultDataUrl(item.resultDataUrl)}
              >
                <img src={item.resultDataUrl} className="w-full aspect-square object-cover" alt="" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <span className="text-white text-xs">查看</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
