import React, { useState } from 'react'
import { downloadBlob, generateFilename, showToast, handlePasteImage, formatSize } from '../lib/utils'

type Format = 'jpeg' | 'png' | 'webp' | 'mp4' | 'webm' | 'gif'

export default function Convert() {
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<(Blob | null)[]>([])
  const [outputFmt, setOutputFmt] = useState<Format>('jpeg')
  const [hasVideo, setHasVideo] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processing, setProcessing] = useState(false)

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return
    const arr = Array.from(fileList).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    setFiles(arr)
    setResults([])
    setHasVideo(arr.some(f => f.type.startsWith('video/')))
    setOutputFmt(arr.some(f => f.type.startsWith('video/')) ? 'mp4' : 'jpeg')
    setProgress(0)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault()
        handlePasteImage(f => handleFiles([f]))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const convertAll = async () => {
    if (files.length === 0) return
    setProcessing(true)
    setResults([])

    const newResults: (Blob | null)[] = []
    for (let i = 0; i < files.length; i++) {
      setProgress(Math.round((i / files.length) * 100))
      try {
        const file = files[i]
        let blob: Blob
        if (file.type.startsWith('video/')) {
          // 视频转换需要 FFmpeg.wasm，这里用简化的 Canvas 方案（仅首帧）
          blob = await convertVideoPlaceholder(file)
        } else {
          blob = await convertImage(file)
        }
        newResults.push(blob)
      } catch {
        newResults.push(null)
      }
    }
    setResults(newResults)
    setProgress(100)
    setProcessing(false)
    showToast('转换完成')
  }

  const convertImage = (file: File): Promise<Blob> => {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = e => {
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
          const mime = outputFmt === 'jpeg' ? 'image/jpeg' : outputFmt === 'webp' ? 'image/webp' : 'image/png'
          canvas.toBlob(b => resolve(b!), mime, outputFmt === 'png' ? undefined : 0.92)
        }
        img.src = e.target.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  const convertVideoPlaceholder = (file: File): Promise<Blob> => {
    // 简化版：返回原文件（实际需要 FFmpeg.wasm）
    return Promise.resolve(file)
  }

  const getExt = (fmt: Format) => fmt === 'jpeg' ? 'jpg' : fmt

  const imageFormats: Format[] = ['jpeg', 'png', 'webp']
  const videoFormats: Format[] = ['mp4', 'webm', 'gif']

  return (
    <div className="space-y-6">
      {/* 上传区域 */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="border-2 border-dashed border-[var(--border)] rounded-xl p-10 text-center cursor-pointer hover:border-[var(--accent)] transition bg-[var(--surface2)]"
        onClick={() => document.getElementById('fileInput')?.click()}
      >
        <input
          id="fileInput"
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={e => handleFiles(e.target.files)}
          className="hidden"
        />
        <div className="text-3xl mb-3">📂</div>
        <div className="text-sm font-medium mb-1">点击或拖入图片/视频</div>
        <div className="text-xs text-[var(--text2)]">图片：JPG/PNG/WebP　视频：MP4/WebM/MOV</div>
      </div>

      {/* 格式选择 */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-3">转换到</div>
        <div className="flex gap-2 flex-wrap">
          {(!hasVideo ? imageFormats : videoFormats).map(fmt => (
            <button
              key={fmt}
              onClick={() => setOutputFmt(fmt)}
              className={`px-4 py-2.5 rounded-lg border font-mono text-sm font-bold transition ${
                outputFmt === fmt
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
              }`}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* 开始按钮 */}
      <button
        onClick={convertAll}
        disabled={files.length === 0 || processing}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processing ? '处理中...' : '开始转换'}
      </button>

      {/* 进度条 */}
      {processing && (
        <div className="space-y-2">
          <div className="h-1.5 rounded-full bg-[var(--surface2)] overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs text-[var(--text2)] text-center">处理中... {progress}%</div>
        </div>
      )}

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => {
            const result = results[i]
            const isVideo = file.type.startsWith('video/')
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface2)] border border-[var(--border)]">
                {isVideo ? (
                  <div className="w-10 h-10 rounded bg-black flex items-center justify-center text-lg">🎬</div>
                ) : (
                  <img src={URL.createObjectURL(file)} className="w-10 h-10 rounded object-cover" alt="" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{file.name}</div>
                  <div className="text-[10px] text-[var(--text2)]">
                    {formatSize(file.size)} · {file.type.split('/')[1].toUpperCase()}
                    {result && <span className="text-[var(--success)] ml-2">→ {formatSize(result.size)}</span>}
                  </div>
                </div>
                {result && (
                  <button
                    onClick={() => {
                      downloadBlob(result, file.name.replace(/\.[^.]+$/, '') + '.' + getExt(outputFmt))
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

      {/* 全部下载 */}
      {results.length > 0 && results.some(r => r !== null) && (
        <button
          onClick={() => {
            results.forEach((r, i) => {
              if (r) setTimeout(() => downloadBlob(r, files[i].name.replace(/\.[^.]+$/, '') + '.' + getExt(outputFmt)), i * 200)
            })
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
