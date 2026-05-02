import { useState, useRef } from 'react'
import { generateGPTImage, GeneratedImage } from '../lib/gpt-image'

const SIZE_OPTIONS = [
  { label: '1024×1024', value: '1024x1024' },
  { label: '1024×1792', value: '1024x1792' },
  { label: '1792×1024', value: '1792x1024' },
]

const N_OPTIONS = [1, 2, 3, 4]

export default function GPTImage() {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [n, setN] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [history, setHistory] = useState<{ prompt: string; images: GeneratedImage[]; time: string }[]>([])
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Prompt 不能为空')
      promptRef.current?.focus()
      return
    }
    setError('')
    setLoading(true)
    setImages([])

    try {
      const result = await generateGPTImage({ prompt: prompt.trim(), size, n, quality: 'high' })
      setImages(result.images)
      setHistory(prev => [
        { prompt: prompt.trim(), images: result.images, time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 19),
      ])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setLoading(false)
    }
  }

  const downloadImage = async (img: GeneratedImage, idx: number) => {
    try {
      const url = img.url!
      if (url.startsWith('data:')) {
        // b64_json 直接下载
        const link = document.createElement('a')
        link.href = url
        link.download = `gpt-image-${idx + 1}.png`
        link.click()
      } else {
        // URL 先 fetch 再下载（避免跨域问题）
        const res = await fetch(url)
        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `gpt-image-${idx + 1}.png`
        link.click()
        URL.revokeObjectURL(blobUrl)
      }
    } catch {
      setError('图片下载失败')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Prompt 输入 */}
      <div>
        <label style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '8px', display: 'block' }}>
          Prompt
        </label>
        <textarea
          ref={promptRef}
          value={prompt}
          onChange={e => { setPrompt(e.target.value); if (error && e.target.value.trim()) setError('') }}
          placeholder="描述你想生成的图片…"
          rows={4}
          style={{
            width: '100%',
            resize: 'vertical',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 16px',
            fontSize: '14px',
            color: '#fff',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.6,
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* 参数选择 */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {/* 尺寸 */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--text2)' }}>尺寸</span>
          {SIZE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSize(opt.value)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                background: size === opt.value ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                color: size === opt.value ? '#a78bfa' : 'var(--text2)',
                border: size === opt.value ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 数量 */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--text2)' }}>数量</span>
          {N_OPTIONS.map(num => (
            <button
              key={num}
              onClick={() => setN(num)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                background: n === num ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                color: n === num ? '#a78bfa' : 'var(--text2)',
                border: n === num ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      {/* 生成按钮 */}
      <button
        onClick={handleGenerate}
        disabled={loading || !prompt.trim()}
        style={{
          padding: '12px 0',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: 600,
          background: loading || !prompt.trim()
            ? 'rgba(139,92,246,0.2)'
            : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
          color: loading || !prompt.trim() ? 'rgba(255,255,255,0.4)' : '#fff',
          border: 'none',
          cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          letterSpacing: '0.5px',
        }}
      >
        {loading ? '生成中…' : '✦ 生成图片'}
      </button>

      {/* 加载动画 */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{
            width: '48px', height: '48px', margin: '0 auto',
            border: '3px solid rgba(139,92,246,0.15)',
            borderTopColor: '#a78bfa',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '16px' }}>
            GPT-Image-2 正在为你绘制…
          </p>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: '#f87171',
          fontSize: '13px',
        }}>
          ⚠ {error}
        </div>
      )}

      {/* 当前生成结果 */}
      {images.length > 0 && !loading && (
        <div>
          <h3 style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '16px' }}>
            生成结果
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '16px' }}>
            {images.map((img, idx) => (
              <div key={idx} style={{
                borderRadius: '12px',
                border: '1px solid var(--border)',
                overflow: 'hidden',
                position: 'relative',
              }}>
                <img
                  src={img.url}
                  alt={img.revised_prompt || `Generated image ${idx + 1}`}
                  style={{
                    width: '100%',
                    display: 'block',
                    borderRadius: '12px 12px 0 0',
                  }}
                />
                {img.revised_prompt && (
                  <p style={{
                    fontSize: '11px', color: 'var(--text2)',
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.02)',
                    borderTop: '1px solid var(--border)',
                  }}>
                    {img.revised_prompt}
                  </p>
                )}
                <button
                  onClick={() => downloadImage(img, idx)}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  ⬇ 下载
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 历史记录 */}
      {history.length > 0 && (
        <div>
          <h3 style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '16px' }}>
            历史记录
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {history.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onClick={() => { setPrompt(item.prompt); setImages(item.images) }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#fff', maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.prompt}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>{item.time}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  {item.images.slice(0, 4).map((img, i) => (
                    <img key={i} src={img.url} alt="" style={{
                      width: '48px', height: '48px', borderRadius: '6px',
                      objectFit: 'cover', border: '1px solid var(--border)',
                    }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}