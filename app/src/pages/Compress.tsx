import { useState, useRef, useEffect } from 'react'
import { downloadBlob, generateFilename, showToast, handlePasteImage, formatSize } from '../lib/utils'

export default function Compress() {
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<{ blob: Blob; original: File }[]>([])
  const [quality, setQuality] = useState(0.8)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleFiles = (fileList: FileList | File[]) => {
    const arr = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    setFiles(arr)
    setResults([])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault()
      handlePasteImage(f => handleFiles([f]))
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const compressAll = async () => {
    const results: { blob: Blob; original: File }[] = []
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file)
      const blob = await compressImage(dataUrl, quality)
      results.push({ blob, original: file })
    }
    setResults(results)
    showToast('压缩完成')
  }

  const compressImage = (dataUrl: string, q: number): Promise<Blob> => {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current!
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        if (quality < 1) {
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
        ctx.drawImage(img, 0, 0)
        canvas.toBlob(b => resolve(b!), 'image/jpeg', q)
      }
      img.src = dataUrl
    })
  }

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise(resolve => {
      const r = new FileReader()
      r.onload = (e) => resolve(e.target!.result as string)
      r.readAsDataURL(file)
    })
  }

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="border-2 border-dashed border-[var(--border)] rounded-xl p-10 text-center cursor-pointer hover:border-[var(--accent)] transition bg-[var(--surface2)]"
        onClick={() => document.getElementById('fileInput')?.click()}
      >
        <input
          id="fileInput"
          type="file"
          accept="image/*"
          multiple
          onChange={e => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />
        <div className="text-3xl mb-3">📂</div>
        <div className="text-sm font-medium mb-1">点击或拖入图片</div>
        <div className="text-xs text-[var(--text2)]">支持多选，Ctrl+V 粘贴</div>
      </div>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-3">压缩质量</div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={quality}
            onChange={e => setQuality(parseFloat(e.target.value))}
            className="flex-1 accent-[var(--accent)]"
          />
          <span className="text-sm font-mono w-12 text-right">{Math.round(quality * 100)}%</span>
        </div>
      </div>

      <button
        onClick={compressAll}
        disabled={files.length === 0}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        开始压缩
      </button>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => {
            const result = results[i]
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface2)] border border-[var(--border)]">
                <img src={URL.createObjectURL(file)} className="w-10 h-10 rounded object-cover" alt="" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{file.name}</div>
                  <div className="text-[10px] text-[var(--text2)]">
                    {formatSize(file.size)}
                    {result && (
                      <span className="text-[var(--success)] ml-2">
                        → {formatSize(result.blob.size)} ({Math.round((1 - result.blob.size / file.size) * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
                {result && (
                  <button
                    onClick={() => {
                      downloadBlob(result.blob, generateFilename('compress'))
                      showToast('下载成功')
                    }}
                    className="px-3 py-1.5 rounded bg-[var(--success)] text-white text-xs font-semibold"
                  >
                    下载
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {results.length > 1 && (
        <button
          onClick={() => {
            results.forEach((r, i) => setTimeout(() => downloadBlob(r.blob, generateFilename('compress')), i * 200))
            showToast('开始下载')
          }}
          className="w-full py-3 rounded-xl bg-[var(--success)] text-white font-bold text-sm"
        >
          ↓ 全部下载
        </button>
      )}
    </div>
  )
}
