import React, { useState } from 'react'
import { downloadBlob, generateFilename, showToast } from '../lib/utils'

const styles = [
  { id: 'avataaars', label: 'Avataaars', desc: '卡通头像' },
  { id: 'avataaars-neutral', label: 'Avataaars Neutral', desc: '中性风格' },
  { id: 'bottts', label: 'Bottts', desc: '机器人' },
  { id: 'bottts-neutral', label: 'Bottts Neutral', desc: '中性机器人' },
  { id: 'lorelei', label: 'Lorelei', desc: '精灵风格' },
  { id: 'notionists', label: 'Notionists', desc: 'Notion 风格' },
  { id: 'notionists-neutral', label: 'Notionists Neutral', desc: '中性 Notion' },
]

export default function Avatar() {
  const [selectedStyle, setSelectedStyle] = useState(styles[0])
  const [seed, setSeed] = useState('')
  const [backgroundColor, setBackgroundColor] = useState('transparent')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const colors = [
    { label: '透明', value: 'transparent' },
    { label: '随机', value: 'random' },
    ...['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#a29bfe', '#fd79a8'].map(c => ({ label: c, value: c })),
  ]

  const generate = () => {
    if (!seed.trim()) {
      showToast('请输入种子文字', 'error')
      return
    }
    setLoading(true)
    const seedParam = encodeURIComponent(seed.trim())
    const bgParam = backgroundColor === 'random' ? '' : `&backgroundColor=${backgroundColor}`
    const url = `https://api.dicebear.com/9.x/${selectedStyle.id}/svg?seed=${seedParam}${bgParam}`
    
    setImageUrl(url)
    setLoading(false)
  }

  const downloadImage = async () => {
    if (!imageUrl) return
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      downloadBlob(blob, generateFilename('avatar', 'svg'))
      showToast('下载成功')
    } catch {
      showToast('下载失败', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* 风格选择 */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-3 block">风格</label>
        <div className="grid grid-cols-2 gap-2">
          {styles.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedStyle(s)}
              className={`px-3 py-3 rounded-lg border text-left transition ${
                selectedStyle.id === s.id
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
              }`}
            >
              <div className="font-semibold text-sm">{s.label}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Seed 输入 */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-2 block">
          种子文字
        </label>
        <input
          type="text"
          value={seed}
          onChange={e => setSeed(e.target.value)}
          placeholder="输入名字、邮箱或任意文字"
          className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm focus:border-[var(--accent)] outline-none"
        />
        <div className="text-[10px] text-[var(--text2)] mt-1">
          相同种子会生成相同头像
        </div>
      </div>

      {/* 背景色 */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--text2)] mb-2 block">背景色</label>
        <div className="flex flex-wrap gap-2">
          {colors.map(c => (
            <button
              key={c.value}
              onClick={() => setBackgroundColor(c.value)}
              className={`w-8 h-8 rounded-full border-2 transition ${
                backgroundColor === c.value ? 'border-[var(--accent)] scale-110' : 'border-transparent'
              }`}
              style={{
                backgroundColor: c.value === 'transparent' ? '#333' : c.value === 'random' ? 'linear-gradient(135deg, #ff6b6b, #4ecdc4, #45b7d1)' : c.value,
                backgroundImage: c.value === 'random' ? 'linear-gradient(135deg, #ff6b6b, #4ecdc4, #45b7d1)' : undefined,
              }}
              title={c.label}
            />
          ))}
        </div>
      </div>

      {/* 生成按钮 */}
      <button
        onClick={generate}
        disabled={loading}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent2)] text-white font-bold text-sm disabled:opacity-50"
      >
        生成头像
      </button>

      {/* 结果 */}
      {imageUrl && (
        <div className="border-t border-[var(--border)] pt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text2)]">生成结果</span>
            <button
              onClick={downloadImage}
              className="px-4 py-2 rounded-lg bg-[var(--success)] text-white text-xs font-semibold"
            >
              ↓ 下载
            </button>
          </div>
          <div className="flex items-center justify-center py-8">
            <img
              src={imageUrl}
              className="w-40 h-40 rounded-full border-4 border-[var(--border)]"
              alt="生成的头像"
            />
          </div>
        </div>
      )}
    </div>
  )
}
