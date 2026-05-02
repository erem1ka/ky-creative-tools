import { useState, useEffect } from 'react'
import { downloadBlob, showToast, handlePasteImage, formatSize } from '../lib/utils'

type Format = 'jpeg' | 'png' | 'webp'

const formats: Format[] = ['jpeg', 'png', 'webp']

const formatExt = (fmt: Format): string => fmt === 'jpeg' ? 'jpg' : fmt
const formatMime = (fmt: Format): string => {
  if (fmt === 'jpeg') return 'image/jpeg'
  if (fmt === 'png') return 'image/png'
  if (fmt === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

interface ConvertItem {
  id: string
  file: File
  status: 'waiting' | 'converting' | 'done' | 'error'
  resultBlob?: Blob
  resultUrl?: string
  error?: string
}

export default function Convert() {
  const [items, setItems] = useState<ConvertItem[]>([])
  const [outputFmt, setOutputFmt] = useState<Format>('jpeg')
  const [processing, setProcessing] = useState(false)

  const handleFiles = (fileList: FileList | File[]) => {
    const arr = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (arr.length === 0) {
      showToast('仅支持图片格式', 'error')
      return
    }
    const newItems: ConvertItem[] = arr.map(f => ({
      id: `${Date.now()}-${f.name}`,
      file: f,
      status: 'waiting',
    }))
    setItems(prev => [...prev, ...newItems])
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

  // Image conversion using Canvas
  const convertImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        if (outputFmt === 'jpeg') {
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
        ctx.drawImage(img, 0, 0)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('图片转换失败')), formatMime(outputFmt), 0.92)
        URL.revokeObjectURL(img.src)
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = URL.createObjectURL(file)
    })
  }

  const startConvert = async () => {
    if (items.length === 0 || processing) return
    setProcessing(true)

    for (const item of items) {
      if (item.status !== 'waiting') continue
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'converting' } : i))
      try {
        const blob = await convertImage(item.file)
        const url = URL.createObjectURL(blob)
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done', resultBlob: blob, resultUrl: url } : i))
      } catch (err: any) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', error: err.message || '转换失败' } : i))
      }
    }
    setProcessing(false)
    showToast('转换完成')
  }

  const downloadAll = () => {
    items.forEach((item, i) => {
      if (item.resultBlob) {
        setTimeout(() => downloadBlob(item.resultBlob!, item.file.name.replace(/\.[^.]+$/, '') + '.' + formatExt(outputFmt)), i * 200)
      }
    })
    showToast('开始下载')
  }

  const removeItem = (id: string) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id)
      if (item?.resultUrl) URL.revokeObjectURL(item.resultUrl)
      return prev.filter(i => i.id !== id)
    })
  }

  const clearAll = () => {
    items.forEach(item => { if (item.resultUrl) URL.revokeObjectURL(item.resultUrl) })
    setItems([])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => document.getElementById('fileInputConv')?.click()}
        style={{
          border: '2px dashed rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '48px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: 'rgba(255,255,255,0.02)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
      >
        <input
          id="fileInputConv"
          type="file"
          accept="image/*"
          multiple
          onChange={e => e.target.files && handleFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>📂</div>
        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>点击或拖入图片</div>
        <div style={{ fontSize: '12px', color: 'var(--text2)' }}>支持 JPG / PNG / WebP / GIF · 可 Ctrl+V 粘贴</div>
      </div>

      {/* Format selector */}
      {items.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: '12px', textTransform: 'uppercase' }}>
            转换到
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {formats.map(fmt => (
              <button
                key={fmt}
                onClick={() => setOutputFmt(fmt)}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  border: outputFmt === fmt ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
                  background: outputFmt === fmt ? 'rgba(255,76,139,0.1)' : 'rgba(255,255,255,0.05)',
                  color: outputFmt === fmt ? 'var(--accent)' : 'var(--text2)',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                .{formatExt(fmt).toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={startConvert}
            disabled={processing || items.every(i => i.status !== 'waiting')}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '12px',
              background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
              border: 'none',
              cursor: processing || items.every(i => i.status !== 'waiting') ? 'not-allowed' : 'pointer',
              opacity: processing || items.every(i => i.status !== 'waiting') ? 0.5 : 1,
            }}
          >
            {processing ? '转换中...' : '开始转换'}
          </button>
          <button
            onClick={clearAll}
            style={{
              padding: '14px 20px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text2)',
              fontWeight: 600,
              fontSize: '13px',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
            }}
          >
            清空
          </button>
        </div>
      )}

      {/* File list */}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(item => (
            <div key={item.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)',
              border: item.status === 'error' ? '1px solid rgba(255,91,91,0.3)' 
                : item.status === 'done' ? '1px solid rgba(62,207,142,0.3)' 
                : '1px solid rgba(255,255,255,0.08)',
            }}>
              {/* Thumbnail */}
              <img src={URL.createObjectURL(item.file)} style={{
                width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover',
              }} alt="" />
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.file.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text2)' }}>
                  {formatSize(item.file.size)} · {item.file.type.split('/')[1].toUpperCase()}
                  {item.status === 'done' && item.resultBlob && (
                    <span style={{ color: 'var(--success)', marginLeft: '8px' }}>
                      → {formatSize(item.resultBlob.size)} .{formatExt(outputFmt).toUpperCase()}
                    </span>
                  )}
                  {item.status === 'error' && (
                    <span style={{ color: 'var(--danger)', marginLeft: '8px' }}>✗ {item.error}</span>
                  )}
                </div>
              </div>
              {/* Download button */}
              {item.status === 'done' && item.resultBlob && (
                <button
                  onClick={() => {
                    downloadBlob(item.resultBlob!, item.file.name.replace(/\.[^.]+$/, '') + '.' + formatExt(outputFmt))
                    showToast('下载成功')
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'var(--success)',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  下载
                </button>
              )}
              {/* Remove button */}
              <button
                onClick={() => removeItem(item.id)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: 'var(--text2)',
                  fontSize: '14px',
                  border: 'none',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Download all */}
      {items.some(i => i.status === 'done' && i.resultBlob) && (
        <button
          onClick={downloadAll}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '12px',
            background: 'var(--success)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '13px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ↓ 全部下载
        </button>
      )}
    </div>
  )
}