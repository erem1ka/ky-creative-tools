import { useState, useRef, useEffect } from 'react'
import { loadFfmpeg, isFfmpegLoaded } from '../lib/ffmpeg-loader'
import { showToast, downloadBlob, formatSize } from '../lib/utils'

type OutputFmt = 'webp' | 'gif'
type PresetSize = '230x230' | 'original' | '80%' | '50%' | 'custom'
type SpeedPreset = 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow'

interface ConvertItem {
  id: string
  file: File
  status: 'waiting' | 'loading' | 'converting' | 'done' | 'error'
  progress: number
  resultBlob?: Blob
  resultUrl?: string
  error?: string
}

const SPEED_OPTIONS: SpeedPreset[] = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow']
const PRESET_SIZES: { key: PresetSize; label: string }[] = [
  { key: '230x230', label: '230×230（默认）' },
  { key: 'original', label: '原始尺寸' },
  { key: '80%', label: '80%' },
  { key: '50%', label: '50%' },
  { key: 'custom', label: '自定义' },
]

export default function ToWebp() {
  const [ffmpegLoaded, setFfmpegLoaded] = useState(isFfmpegLoaded())
  const [loadingFfmpeg, setLoadingFfmpeg] = useState(false)
  const ffmpegRef = useRef<any>(null)

  const [outputFmt, setOutputFmt] = useState<OutputFmt>('webp')
  const [presetSize, setPresetSize] = useState<PresetSize>('230x230')
  const [customW, setCustomW] = useState(230)
  const [customH, setCustomH] = useState(230)
  const [fps, setFps] = useState(14)
  const [quality, setQuality] = useState(75)
  const [speed, setSpeed] = useState<SpeedPreset>('ultrafast')
  const [trimStart, setTrimStart] = useState('')
  const [trimEnd, setTrimEnd] = useState('')
  const [showOptions, setShowOptions] = useState(false)

  const [items, setItems] = useState<ConvertItem[]>([])
  const [converting, setConverting] = useState(false)

  // Load ffmpeg on mount
  useEffect(() => {
    loadFfmpegLocal()
  }, [])

  const loadFfmpegLocal = async () => {
    if (ffmpegLoaded || loadingFfmpeg) return
    setLoadingFfmpeg(true)
    try {
      const { ffmpeg, loaded } = await loadFfmpeg()
      if (loaded) {
        ffmpegRef.current = ffmpeg
        // Register progress handler for this page
        ffmpeg.on('progress', ({ progress }) => {
          setItems(prev => prev.map(item => {
            if (item.status === 'converting') {
              return { ...item, progress: Math.round(progress * 100) }
            }
            return item
          }))
        })
        setFfmpegLoaded(true)
        showToast('FFmpeg 加载完成，可以开始转换')
      } else {
        showToast('FFmpeg 加载失败', 'error')
      }
    } catch (err: any) {
      console.error('FFmpeg load error:', err)
      showToast('FFmpeg 加载失败: ' + err.message, 'error')
    }
    setLoadingFfmpeg(false)
  }

  const handleFiles = (fileList: FileList | File[]) => {
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/x-flv', 'video/3gpp', 'video/mp2t', 'video/ogg']
    const arr = Array.from(fileList).filter(f =>
      f.type.startsWith('video/') || videoTypes.some(t => f.type === t) || f.name.match(/\.(mp4|webm|mov|avi|mkv|flv|3gp|ts|ogv|m4v)$/i)
    )
    if (arr.length === 0) {
      showToast('请选择视频文件', 'error')
      return
    }
    const newItems: ConvertItem[] = arr.map(f => ({
      id: `${Date.now()}-${f.name}`,
      file: f,
      status: 'waiting',
      progress: 0,
    }))
    setItems(prev => [...prev, ...newItems])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Calculate output dimensions
  const getOutputDims = async (inputFile: File): Promise<{ w: number; h: number }> => {
    if (presetSize === '230x230') return { w: 230, h: 230 }
    if (presetSize === 'custom') return { w: customW, h: customH }

    // Get original dimensions via video element
    const url = URL.createObjectURL(inputFile)
    const video = document.createElement('video')
    video.src = url
    await new Promise<void>(resolve => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => resolve()
    })
    const origW = video.videoWidth || 230
    const origH = video.videoHeight || 230
    URL.revokeObjectURL(url)

    if (presetSize === 'original') return { w: origW, h: origH }

    const pct = parseInt(presetSize) / 100
    return { w: Math.round(origW * pct), h: Math.round(origH * pct) }
  }

  // Convert a single file
  const convertItem = async (item: ConvertItem): Promise<ConvertItem> => {
    const ffmpeg = ffmpegRef.current
    if (!ffmpegLoaded) {
      return { ...item, status: 'error', error: 'FFmpeg 未加载' }
    }

    const ext = item.file.name.split('.').pop() || 'mp4'
    const inputName = `input_${item.id}.${ext}`
    const outputName = `output_${item.id}.${outputFmt}`

    // Mark as converting
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'converting', progress: 0 } : i))

    try {
      // Write input file - read as ArrayBuffer for reliability
      const fileData = await item.file.arrayBuffer()
      await ffmpeg.writeFile(inputName, new Uint8Array(fileData))
      console.log('[ToWebp] Written input file:', inputName, 'size:', item.file.size, 'arrayBuffer size:', fileData.byteLength)

      // Get output dimensions
      const dims = await getOutputDims(item.file)
      const scaleFilter = `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2:color=white`

      // Build ffmpeg args based on output format
      let exitCode: number
      
      if (outputFmt === 'webp') {
        // WebP: single step
        const args: string[] = []
        if (trimStart) args.push('-ss', trimStart)
        if (trimEnd) args.push('-to', trimEnd)
        args.push('-i', inputName)
        args.push('-vf', `fps=${fps},${scaleFilter}`)
        args.push('-c:v', 'libwebp', '-lossless', '0', '-compression_level', '4',
          '-q:v', String(quality), '-loop', '0', '-an')
        args.push('-y', outputName)
        console.log('[ToWebp] WebP args:', args.join(' '))
        exitCode = await ffmpeg.exec(args)
      } else {
        // GIF: two-step palettegen/paletteuse
        const paletteName = `palette_${item.id}.png`
        
        // Step 1: Generate palette
        const paletteArgs: string[] = []
        if (trimStart) paletteArgs.push('-ss', trimStart)
        if (trimEnd) paletteArgs.push('-to', trimEnd)
        paletteArgs.push('-i', inputName)
        paletteArgs.push('-vf', `fps=${fps},${scaleFilter},palettegen`)
        paletteArgs.push('-y', paletteName)
        console.log('[ToWebp] GIF palette args:', paletteArgs.join(' '))
        exitCode = await ffmpeg.exec(paletteArgs)
        console.log('[ToWebp] Palette exit code:', exitCode)
        
        if (exitCode !== 0) {
          throw new Error(`生成调色板失败（exitCode=${exitCode})`)
        }

        // Step 2: Generate GIF using palette
        const gifArgs: string[] = []
        if (trimStart) gifArgs.push('-ss', trimStart)
        if (trimEnd) gifArgs.push('-to', trimEnd)
        gifArgs.push('-i', inputName, '-i', paletteName)
        gifArgs.push('-filter_complex', `[0:v]fps=${fps},${scaleFilter}[x];[x][1:v]paletteuse`)
        gifArgs.push('-loop', '0', '-an')
        gifArgs.push('-y', outputName)
        console.log('[ToWebp] GIF args:', gifArgs.join(' '))
        exitCode = await ffmpeg.exec(gifArgs)

        // Clean palette
        try { await ffmpeg.deleteFile(paletteName) } catch {}
      }
      console.log('[ToWebp] ffmpeg final exit code:', exitCode)

      // Read output
      const data = await ffmpeg.readFile(outputName) as Uint8Array
      console.log('[ToWebp] readFile result type:', typeof data, 'constructor:', data?.constructor?.name, 'length:', data?.length, 'byteLength:', data?.byteLength)
      
      if (!data || data.length === 0) {
        throw new Error(`输出文件为空（0 bytes），exitCode=${exitCode}`)
      }
      
      const mime = outputFmt === 'webp' ? 'image/webp' : 'image/gif'
      // Create blob from Uint8Array data
      const uint8 = new Uint8Array(data.length)
      uint8.set(data)
      const blob = new Blob([uint8], { type: mime })
      console.log('[ToWebp] blob size:', blob.size, 'type:', blob.type)
      const resultUrl = URL.createObjectURL(blob)

      // Clean up
      await ffmpeg.deleteFile(inputName)
      await ffmpeg.deleteFile(outputName)

      return {
        ...item,
        status: 'done',
        progress: 100,
        resultBlob: blob,
        resultUrl,
      }
    } catch (err: any) {
      console.error('Convert error:', err)
      return { ...item, status: 'error', error: err.message || '转换失败' }
    }
  }

  // Convert all waiting items
  const convertAll = async () => {
    if (!ffmpegLoaded) {
      showToast('FFmpeg 正在加载，请稍候...', 'error')
      return
    }
    setConverting(true)
    const waitingItems = items.filter(i => i.status === 'waiting')
    for (const item of waitingItems) {
      const updated = await convertItem(item)
      setItems(prev => prev.map(i => i.id === item.id ? updated : i))
    }
    setConverting(false)
    showToast('转换完成')
  }

  const downloadResult = (item: ConvertItem) => {
    if (!item.resultBlob || !item.resultUrl) return
    const filename = item.file.name.replace(/\.[^.]+$/, `.${outputFmt}`)
    downloadBlob(item.resultBlob, filename)
  }

  const downloadAll = () => {
    items.filter(i => i.status === 'done' && i.resultBlob).forEach(i => downloadResult(i))
  }

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const clearAll = () => {
    setItems([])
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', padding: '0 32px', height: '56px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(10,10,18,0.94)', backdropFilter: 'blur(20px)',
        position: 'sticky', top: 0, zIndex: 100, gap: '16px',
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '9px', textDecoration: 'none' }}>
          <img src="/logo.webp" alt="快影" width="24" height="24" style={{ objectFit: 'contain' }} />
          <span style={{ fontSize: '14px', fontWeight: 700, background: 'linear-gradient(90deg,#ff4c8b,#ff8c3d)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>快影</span>
        </a>
        <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.08)' }} />
        <span style={{ fontSize: '13px', color: 'var(--text2)' }}>🔄 视频转动图</span>
        <a href="/" style={{
          marginLeft: 'auto', fontSize: '12px', color: 'var(--text2)',
          textDecoration: 'none', padding: '5px 12px', borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)',
        }}>← 返回工具集</a>
      </header>

      {/* Main content */}
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* Format selector */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
          marginBottom: '24px',
        }}>
          <div style={{
            padding: '8px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
            background: 'var(--surface2)', color: 'var(--text)',
            border: '1px solid var(--border)',
          }}>
            视频
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>转</span>
          <div style={{
            padding: '8px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
            background: 'var(--surface2)', color: 'var(--text)',
            border: '1px solid var(--border)', display: 'flex', gap: '4px',
          }}>
            {(['webp', 'gif'] as OutputFmt[]).map(fmt => (
              <button key={fmt} onClick={() => setOutputFmt(fmt)} style={{
                padding: '4px 12px', borderRadius: '6px', fontSize: '12px',
                fontWeight: 700, border: 'none', cursor: 'pointer',
                background: outputFmt === fmt ? 'var(--accent)' : 'transparent',
                color: outputFmt === fmt ? '#fff' : 'var(--text2)',
                transition: 'all 0.15s',
              }}>
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Options toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
          <button onClick={() => setShowOptions(!showOptions)} style={{
            padding: '6px 16px', borderRadius: '8px', fontSize: '12px',
            background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
            cursor: 'pointer', fontWeight: 600,
          }}>
            {showOptions ? '收起选项' : '⚙ 选项'} 
            {presetSize !== '230x230' || fps !== 14 || quality !== 75 || speed !== 'ultrafast' || trimStart || trimEnd
              ? ' (已修改)' : ''}
          </button>
        </div>

        {/* Options panel */}
        {showOptions && (
          <div style={{
            padding: '20px', borderRadius: '14px', border: '1px solid var(--border)',
            background: 'var(--surface)', marginBottom: '20px',
            display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            {/* Size */}
            <ParamRow label="输出尺寸">
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {PRESET_SIZES.map(ps => (
                  <button key={ps.key} onClick={() => setPresetSize(ps.key)} style={{
                    padding: '5px 10px', borderRadius: '6px', fontSize: '11px',
                    fontWeight: presetSize === ps.key ? 700 : 500, border: 'none', cursor: 'pointer',
                    background: presetSize === ps.key ? 'var(--accent)' : 'var(--surface2)',
                    color: presetSize === ps.key ? '#fff' : 'var(--text2)',
                  }}>
                    {ps.label}
                  </button>
                ))}
              </div>
              {presetSize === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                  <input type="number" value={customW} onChange={e => setCustomW(Number(e.target.value))}
                    style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: '12px' }} />
                  <span style={{ fontSize: '12px', color: 'var(--text2)' }}>×</span>
                  <input type="number" value={customH} onChange={e => setCustomH(Number(e.target.value))}
                    style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: '12px' }} />
                  <span style={{ fontSize: '10px', color: 'var(--text2)' }}>px</span>
                </div>
              )}
            </ParamRow>

            {/* FPS */}
            <ParamRow label="帧率">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" value={fps} onChange={e => setFps(Math.max(1, Math.min(120, Number(e.target.value))))}
                  style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: '12px' }} />
                <span style={{ fontSize: '11px', color: 'var(--text2)' }}>fps（1-120）</span>
              </div>
            </ParamRow>

            {/* Quality */}
            <ParamRow label="图片品质">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input type="range" min={1} max={100} value={quality} onChange={e => setQuality(Number(e.target.value))}
                  style={{ width: '120px', accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{quality}</span>
              </div>
            </ParamRow>

            {/* Speed */}
            <ParamRow label="编码速度">
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {SPEED_OPTIONS.map(s => (
                  <button key={s} onClick={() => setSpeed(s)} style={{
                    padding: '4px 8px', borderRadius: '5px', fontSize: '10px',
                    fontWeight: speed === s ? 700 : 500, border: 'none', cursor: 'pointer',
                    background: speed === s ? 'var(--accent)' : 'var(--surface2)',
                    color: speed === s ? '#fff' : 'var(--text2)',
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            </ParamRow>

            {/* Trim */}
            <ParamRow label="剪辑时间">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="text" value={trimStart} onChange={e => setTrimStart(e.target.value)} placeholder="00:00:00"
                  style={{ width: '90px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: '11px', textAlign: 'center' }} />
                <span style={{ fontSize: '11px', color: 'var(--text2)' }}>~</span>
                <input type="text" value={trimEnd} onChange={e => setTrimEnd(e.target.value)} placeholder="00:00:00"
                  style={{ width: '90px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: '11px', textAlign: 'center' }} />
                <button onClick={() => { setTrimStart(''); setTrimEnd('') }} style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: '10px',
                  background: 'var(--surface2)', color: 'var(--text2)', border: 'none', cursor: 'pointer',
                }}>清除</button>
              </div>
            </ParamRow>

            {/* Reset defaults */}
            <button onClick={() => {
              setPresetSize('230x230'); setFps(14); setQuality(75); setSpeed('ultrafast');
              setTrimStart(''); setTrimEnd(''); setCustomW(230); setCustomH(230);
              setShowOptions(false);
            }} style={{
              padding: '6px 16px', borderRadius: '8px', fontSize: '12px',
              background: 'rgba(239,68,68,0.1)', color: '#f87171',
              border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer',
            }}>
              重置默认参数
            </button>
          </div>
        )}

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '40px 20px', borderRadius: '14px',
            border: '2px dashed var(--border)', cursor: 'pointer',
            background: 'var(--surface)', textAlign: 'center',
            marginBottom: '24px', transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📁</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
            拖放视频文件到此处
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
            或点击选择文件 · 支持 MP4 WebM MOV AVI MKV FLV 等格式 · 批量转换
          </div>
          <input ref={fileInputRef} type="file" accept="video/*,.mp4,.webm,.mov,.avi,.mkv,.flv,.3gp,.ts,.ogv,.m4v" multiple
            style={{ display: 'none' }} onChange={e => e.target.files && handleFiles(e.target.files)} />
        </div>

        {/* FFmpeg loading status */}
        {!ffmpegLoaded && (
          <div style={{
            padding: '16px', borderRadius: '10px', background: 'rgba(59,130,246,0.1)',
            border: '1px solid rgba(59,130,246,0.2)', marginBottom: '24px',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <span style={{ width: '20px', height: '20px', border: '2px solid rgba(59,130,246,0.3)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} />
            <span style={{ fontSize: '12px', color: '#60a5fa' }}>
              {loadingFfmpeg ? '正在加载 FFmpeg 核心（首次约 30MB，需等待）...' : 'FFmpeg 未加载'}
            </span>
            {!loadingFfmpeg && (
              <button onClick={loadFfmpegLocal} style={{
                padding: '4px 12px', borderRadius: '6px', fontSize: '11px',
                background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
              }}>重新加载</button>
            )}
          </div>
        )}

        {/* File list + Convert button */}
        {items.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            {/* Actions bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '16px',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                {items.length} 个文件 · {items.filter(i => i.status === 'done').length} 已完成
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {items.some(i => i.status === 'done') && (
                  <button onClick={downloadAll} style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '11px',
                    background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
                    fontWeight: 600,
                  }}>↓ 全部保存</button>
                )}
                <button onClick={clearAll} style={{
                  padding: '6px 14px', borderRadius: '8px', fontSize: '11px',
                  background: 'var(--surface2)', color: 'var(--text2)', border: 'none', cursor: 'pointer',
                }}>清空</button>
              </div>
            </div>

            {/* Convert button */}
            {items.some(i => i.status === 'waiting') && (
              <button onClick={convertAll} disabled={converting || !ffmpegLoaded} style={{
                width: '100%', padding: '12px', borderRadius: '12px',
                background: 'var(--accent)', color: '#fff', fontSize: '14px',
                fontWeight: 700, border: 'none', cursor: converting || !ffmpegLoaded ? 'not-allowed' : 'pointer',
                opacity: converting || !ffmpegLoaded ? 0.5 : 1,
                marginBottom: '16px',
              }}>
                {converting ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                    转换中...
                  </span>
                ) : `🔄 开始转换 (${items.filter(i => i.status === 'waiting').length} 个文件)`}
              </button>
            )}

            {/* Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map(item => (
                <div key={item.id} style={{
                  padding: '16px', borderRadius: '12px',
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  display: 'flex', gap: '12px', alignItems: 'flex-start',
                }}>
                  {/* Preview */}
                  {item.status === 'done' && item.resultUrl ? (
                    <div style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: '#111', flexShrink: 0 }}>
                      <img src={item.resultUrl} alt="result" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div style={{ width: '80px', height: '80px', borderRadius: '8px', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '24px' }}>🎬</span>
                    </div>
                  )}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.file.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text2)', marginBottom: '6px' }}>
                      {formatSize(item.file.size)} · {outputFmt.toUpperCase()} · {presetSize === 'custom' ? `${customW}×${customH}` : presetSize} · {fps}fps
                    </div>

                    {/* Status */}
                    {item.status === 'waiting' && (
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(234,179,8,0.15)', color: '#facc15' }}>等待转换</span>
                    )}
                    {item.status === 'converting' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '12px', height: '12px', border: '1.5px solid rgba(59,130,246,0.3)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                        <span style={{ fontSize: '10px', color: '#60a5fa' }}>转换中 {item.progress}%</span>
                      </div>
                    )}
                    {item.status === 'done' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>✓ 完成</span>
                        {item.resultBlob && (
                          <span style={{ fontSize: '10px', color: 'var(--text2)' }}>{formatSize(item.resultBlob.size)}</span>
                        )}
                      </div>
                    )}
                    {item.status === 'error' && (
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                        ✗ {item.error || '转换失败'}
                      </span>
                    )}

                    {/* Progress bar */}
                    {item.status === 'converting' && (
                      <div style={{ width: '100%', height: '3px', borderRadius: '2px', background: 'var(--surface2)', marginTop: '6px' }}>
                        <div style={{ height: '3px', borderRadius: '2px', background: 'var(--accent)', width: `${item.progress}%`, transition: 'width 0.3s' }} />
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {item.status === 'done' && (
                      <button onClick={() => downloadResult(item)} style={{
                        padding: '5px 10px', borderRadius: '6px', fontSize: '10px',
                        background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
                        fontWeight: 600,
                      }}>↓ 下载</button>
                    )}
                    <button onClick={() => removeItem(item.id)} style={{
                      padding: '5px 8px', borderRadius: '6px', fontSize: '10px',
                      background: 'var(--surface2)', color: 'var(--text2)', border: 'none', cursor: 'pointer',
                    }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info section */}
        <div style={{
          padding: '20px', borderRadius: '14px', background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>使用说明</h3>
          <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.8 }}>
            <p>• 所有转换在浏览器本地完成，不上传服务器，隐私安全</p>
            <p>• 默认输出：230×230 分辨率、14fps 帧率、品质 75</p>
            <p>• 支持输入格式：MP4、WebM、MOV、AVI、MKV、FLV、3GP、TS 等</p>
            <p>• 输出格式：WebP 动图（推荐，体积小画质好）或 GIF 动图</p>
            <p>• 可自定义尺寸、帧率、品质、编码速度、剪辑片段</p>
            <p>• 首次使用需加载约 30MB 的 FFmpeg 核心文件，后续浏览器缓存</p>
          </div>
        </div>
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', minWidth: '70px', paddingTop: '6px' }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}