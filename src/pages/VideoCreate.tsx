import { useState, useEffect, useRef, useCallback } from 'react'
import { showToast } from '../lib/utils'
import { submitVideoTask, pollVideoTask, generateImage, chatCompletion, getSeedanceKey, getSeedKey, getSeedreamKey, hasSeedanceKey, hasSeedKey, hasSeedreamKey, saveSeedanceKey, saveSeedKey, saveSeedreamKey } from '../lib/wanqing'

// ===== Types =====
type CreateMode = 'text2video' | 'image2video' | 'ai-script' | 'text2image'

interface VideoTask {
  id: string
  taskId: string
  prompt: string
  mode: CreateMode
  duration?: number
  resolution?: string
  size?: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  videoUrl?: string
  imageUrl?: string
  error?: string
  createdAt: number
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

// ===== Constants =====
const RESOLUTIONS = ['1080p', '720p', '480p']
const SIZES = ['16:9', '9:16', '1:1', '4:3', '3:4']
const DURATIONS = [5, 10]
const IMAGE_SIZES = ['2K', '1K', '512x512', '1024x1024']

const STYLE_PRESETS = [
  { label: '电影大片', prompt: '电影级画质，景深，光线追踪，超现实主义，动态模糊' },
  { label: '赛博朋克', prompt: '赛博朋克风格，霓虹灯光，未来都市，高对比，夜景' },
  { label: '自然风光', prompt: '自然风景，4K超清，慢动作，风吹草动，阳光透射' },
  { label: '产品展示', prompt: '产品展示，旋转，白色背景，柔和光线，高级质感' },
  { label: '粒子特效', prompt: '粒子爆炸特效，发光，能量流动，宇宙空间，震撼' },
  { label: '抽象艺术', prompt: '抽象流体艺术，渐变色彩，液态金属，艺术感，迷幻' },
]

const SCRIPT_TEMPLATES = [
  { label: '产品广告', prompt: '请帮我写一段30秒的产品广告视频脚本，描述产品特点和使用场景' },
  { label: '故事短片', prompt: '请帮我写一个短视频故事脚本，包含起承转合，有悬念和反转' },
  { label: '宣传推广', prompt: '请帮我写一段品牌宣传视频脚本，突出品牌理念和视觉风格' },
  { label: '教学演示', prompt: '请帮我写一段教学演示视频脚本，分步骤讲解操作流程' },
]

const MODES: { key: CreateMode; label: string; icon: string }[] = [
  { key: 'text2video', label: '文生视频', icon: '🎬' },
  { key: 'image2video', label: '图生视频', icon: '🖼️' },
  { key: 'ai-script', label: 'AI 脚本', icon: '✍️' },
  { key: 'text2image', label: '图片生成', icon: '🎨' },
]

const STORAGE_KEY = 'videocreate-tasks-v2'

// ===== Main Component =====
export default function VideoCreate() {
  const [seedanceKeyInput, setSeedanceKeyInput] = useState(getSeedanceKey())
  const [seedKeyInput, setSeedKeyInput] = useState(getSeedKey())
  const [seedreamKeyInput, setSeedreamKeyInput] = useState(getSeedreamKey())
  const [mode, setMode] = useState<CreateMode>('text2video')
  const [tasks, setTasks] = useState<VideoTask[]>([])
  const [_pollingSet, setPollingSet] = useState<Set<string>>(new Set())

  // 文生视频参数
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('720p')
  const [videoSize, setVideoSize] = useState('16:9')
  const [showPresets, setShowPresets] = useState(false)

  // 图生视频参数
  const [refImageUrl, setRefImageUrl] = useState('')
  const [i2vPrompt, setI2vPrompt] = useState('')

  // AI脚本参数
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  // 图片生成参数
  const [imgPrompt, setImgPrompt] = useState('')
  const [imgSize, setImgSize] = useState('2K')
  const [imgWatermark, setImgWatermark] = useState(false)

  // 生成状态
  const [generating, setGenerating] = useState(false)

  // 从 localStorage 恢复
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const loaded: VideoTask[] = JSON.parse(saved)
        setTasks(loaded)
        loaded.forEach(t => {
          if (t.status === 'pending' || t.status === 'running') {
            startPolling(t.id, t.taskId)
          }
        })
      }
    } catch {}
  }, [])

  const saveTasks = useCallback((newTasks: VideoTask[]) => {
    setTasks(newTasks)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newTasks))
  }, [])

  // ===== 轮询逻辑 =====
  const startPolling = useCallback((localId: string, taskId: string) => {
    setPollingSet(prev => new Set(prev).add(localId))

    const poll = async () => {
      try {
        const result = await pollVideoTask(taskId)

        setTasks(prev => {
          const updated = prev.map(t => {
            if (t.id !== localId) return t
            return {
              ...t,
              status: result.status,
              videoUrl: result.videoUrl,
              error: result.error,
            }
          })
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
          return updated
        })

        if (result.status === 'succeeded') {
          setPollingSet(p => { const s = new Set(p); s.delete(localId); return s })
          showToast('🎬 视频生成完成！')
        } else if (result.status === 'failed') {
          setPollingSet(p => { const s = new Set(p); s.delete(localId); return s })
          showToast(result.error || '视频生成失败', 'error')
        } else {
          // 继续轮询
          setTimeout(poll, 5000)
        }
      } catch {
        setTimeout(poll, 8000)
      }
    }

    setTimeout(poll, 3000)
  }, [])

  // ===== 文生视频 =====
  const handleText2Video = async () => {
    if (!hasSeedanceKey()) { showToast('请先在上方配置 Seedance API Key', 'error'); return }
    if (!prompt.trim()) { showToast('请输入视频描述', 'error'); return }
    setGenerating(true)
    try {
      const taskId = await submitVideoTask({
        prompt: prompt.trim(),
        duration,
        resolution,
        size: videoSize,
        watermark: false,
      })
      const newTask: VideoTask = {
        id: Date.now().toString(),
        taskId,
        prompt: prompt.trim(),
        mode: 'text2video',
        duration,
        resolution,
        size: videoSize,
        status: 'pending',
        createdAt: Date.now(),
      }
      const newTasks = [newTask, ...tasks]
      saveTasks(newTasks)
      startPolling(newTask.id, taskId)
      showToast('任务已提交，生成中...')
    } catch (err: any) {
      showToast(err.message || '提交失败', 'error')
    }
    setGenerating(false)
  }

  // ===== 图生视频 =====
  const handleImage2Video = async () => {
    if (!hasSeedanceKey()) { showToast('请先在上方配置 Seedance API Key', 'error'); return }
    if (!i2vPrompt.trim()) { showToast('请输入视频描述', 'error'); return }
    setGenerating(true)
    try {
      const taskId = await submitVideoTask({
        prompt: i2vPrompt.trim(),
        duration,
        resolution,
        size: videoSize,
        watermark: false,
      })
      const newTask: VideoTask = {
        id: Date.now().toString(),
        taskId,
        prompt: i2vPrompt.trim() || '图生视频',
        mode: 'image2video',
        duration,
        resolution,
        size: videoSize,
        status: 'pending',
        createdAt: Date.now(),
      }
      const newTasks = [newTask, ...tasks]
      saveTasks(newTasks)
      startPolling(newTask.id, taskId)
      showToast('图生视频任务已提交')
    } catch (err: any) {
      showToast(err.message || '提交失败', 'error')
    }
    setGenerating(false)
  }

  // ===== AI 脚本 =====
  const handleSendChat = async () => {
    if (!hasSeedKey()) { showToast('请先在上方配置 Seed API Key', 'error'); return }
    if (!chatInput.trim()) return
    const userMsg: ChatMsg = { role: 'user', content: chatInput.trim() }
    const newMsgs = [...chatMessages, userMsg]
    setChatMessages(newMsgs)
    setChatInput('')
    setChatLoading(true)
    try {
      const systemPrompt = '你是一个专业的视频脚本创作助手。你的任务是根据用户的创意想法，生成详细的视频描述脚本，包括画面内容、镜头运动、光线氛围等，方便用户直接用于AI视频生成。回复要简洁实用，直接给出可用的视频描述。'
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...newMsgs.map(m => ({ role: m.role, content: m.content })),
      ]
      const reply = await chatCompletion(messages)
      setChatMessages([...newMsgs, { role: 'assistant', content: reply }])
    } catch (err: any) {
      showToast(err.message || 'AI 脚本生成失败', 'error')
    }
    setChatLoading(false)
  }

  // ===== 图片生成 =====
  const handleText2Image = async () => {
    if (!hasSeedreamKey()) { showToast('请先在上方配置 Seedream API Key', 'error'); return }
    if (!imgPrompt.trim()) { showToast('请输入图片描述', 'error'); return }
    setGenerating(true)
    try {
      const imageUrl = await generateImage({
        prompt: imgPrompt.trim(),
        size: imgSize,
        watermark: imgWatermark,
      })
      const newTask: VideoTask = {
        id: Date.now().toString(),
        taskId: `img-${Date.now()}`,
        prompt: imgPrompt.trim(),
        mode: 'text2image',
        size: imgSize,
        status: 'succeeded',
        imageUrl,
        createdAt: Date.now(),
      }
      const newTasks = [newTask, ...tasks]
      saveTasks(newTasks)
      showToast('图片生成完成！')
    } catch (err: any) {
      showToast(err.message || '图片生成失败', 'error')
    }
    setGenerating(false)
  }

  // ===== 下载 =====
  const downloadFile = async (url: string, filename: string) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
      showToast('下载开始')
    } catch {
      window.open(url, '_blank')
    }
  }

  // ===== 引用图片到图生视频 =====
  const useRefImage = (url: string) => {
    setRefImageUrl(url)
    setMode('image2video')
    showToast('已引用图片，请在图生视频模式中生成')
  }

  // ===== 引用脚本到文生视频 =====
  const useRefScript = (text: string) => {
    setPrompt(text)
    setMode('text2video')
    showToast('已填入脚本，可直接生成视频')
  }

  // ===== 清除 =====
  const clearCompleted = () => {
    const remaining = tasks.filter(t => t.status === 'pending' || t.status === 'running')
    saveTasks(remaining)
  }

  // ===== 上传参考图 =====
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleUploadRefImage = () => fileInputRef.current?.click()
  const handleRefImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setRefImageUrl(reader.result as string)
      showToast('参考图片已加载')
    }
    reader.readAsDataURL(file)
  }

  // ===== 渲染 =====
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
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
        <span style={{ fontSize: '13px', color: 'var(--text2)' }}>🎬 视频创作</span>
        <a href="/" style={{
          marginLeft: 'auto', fontSize: '12px', color: 'var(--text2)',
          textDecoration: 'none', padding: '5px 12px', borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)',
        }}>← 返回工具集</a>
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
          value={seedanceKeyInput}
          onChange={e => setSeedanceKeyInput(e.target.value)}
          placeholder="Seedance Key（视频生成）"
          style={{ width: '200px', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', fontSize: '11px', fontFamily: 'monospace' }}
        />
        <input
          type="password"
          value={seedreamKeyInput}
          onChange={e => setSeedreamKeyInput(e.target.value)}
          placeholder="Seedream Key（图片生成）"
          style={{ width: '200px', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', fontSize: '11px', fontFamily: 'monospace' }}
        />
        <input
          type="password"
          value={seedKeyInput}
          onChange={e => setSeedKeyInput(e.target.value)}
          placeholder="Seed Key（AI 对话）"
          style={{ width: '200px', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', fontSize: '11px', fontFamily: 'monospace' }}
        />
        <button
          onClick={() => { saveSeedanceKey(seedanceKeyInput); saveSeedreamKey(seedreamKeyInput); saveSeedKey(seedKeyInput); showToast('API Key 已保存') }}
          style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >保存</button>
      </div>

      <div className="flex-1 flex">
        {/* ===== 左侧：模式Tab + 参数 ===== */}
        <aside style={{
          width: '300px', borderRight: '1px solid var(--border)',
          background: 'var(--surface)', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* 模式Tab */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '4px',
            padding: '12px 12px 8px', borderBottom: '1px solid var(--border)',
          }}>
            {MODES.map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                style={{
                  padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                  fontWeight: mode === m.key ? 700 : 500, border: 'none', cursor: 'pointer',
                  background: mode === m.key ? 'var(--accent)' : 'var(--surface2)',
                  color: mode === m.key ? '#fff' : 'var(--text2)',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <span>{m.icon}</span> {m.label}
              </button>
            ))}
          </div>

          {/* 参数面板（根据模式切换） */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            {/* ===== 文生视频 ===== */}
            {mode === 'text2video' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>视频描述</label>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="描述你想生成的视频内容..."
                    rows={5}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: '10px',
                      border: '1px solid var(--border)', background: 'var(--surface2)',
                      color: 'var(--text)', fontSize: '12px', resize: 'none', outline: 'none',
                    }}
                  />
                </div>

                {/* 风格预设 */}
                <div>
                  <button onClick={() => setShowPresets(!showPresets)}
                    style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    风格预设 <span style={{ fontSize: '14px' }}>{showPresets ? '−' : '+'}</span>
                  </button>
                  {showPresets && (
                    <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      {STYLE_PRESETS.map(p => (
                        <button key={p.label} onClick={() => { setPrompt(prev => prev ? `${prev}, ${p.prompt}` : p.prompt); setShowPresets(false) }}
                          style={{ padding: '6px 8px', borderRadius: '6px', fontSize: '10px', border: 'none', cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text)', textAlign: 'left', transition: 'all 0.15s' }}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 时长 */}
                <ParamGroup label="时长">
                  {DURATIONS.map(d => (
                    <PillBtn key={d} active={duration === d} onClick={() => setDuration(d)}>{d}s</PillBtn>
                  ))}
                </ParamGroup>

                {/* 分辨率 */}
                <ParamGroup label="分辨率">
                  {RESOLUTIONS.map(r => (
                    <PillBtn key={r} active={resolution === r} onClick={() => setResolution(r)}>{r}</PillBtn>
                  ))}
                </ParamGroup>

                {/* 比例 */}
                <ParamGroup label="画面比例">
                  {SIZES.map(s => (
                    <PillBtn key={s} active={videoSize === s} onClick={() => setVideoSize(s)}>{s}</PillBtn>
                  ))}
                </ParamGroup>

                <GenerateBtn onClick={handleText2Video} disabled={generating || !prompt.trim() || !hasSeedanceKey()} loading={generating}>
                  🎬 生成视频
                </GenerateBtn>
                {!hasSeedanceKey() && <p style={{ fontSize: '10px', color: '#f87171', textAlign: 'center' }}>⚠️ 请先在上方配置 Seedance API Key</p>}
                <p style={{ fontSize: '10px', color: 'var(--text2)', textAlign: 'center' }}>
                  Seedance 2.0 · 生成通常需要 1-3 分钟
                </p>
              </div>
            )}

            {/* ===== 图生视频 ===== */}
            {mode === 'image2video' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>参考图片</label>
                  {refImageUrl ? (
                    <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <img src={refImageUrl} alt="参考图" style={{ width: '100%', maxHeight: '160px', objectFit: 'cover' }} />
                      <button onClick={() => setRefImageUrl('')}
                        style={{ position: 'absolute', top: '6px', right: '6px', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        ×
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: '20px', borderRadius: '10px', border: '2px dashed var(--border)', textAlign: 'center' }}>
                      <button onClick={handleUploadRefImage}
                        style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--surface2)', color: 'var(--text)', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                        📁 上传参考图片
                      </button>
                      <p style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '6px' }}>或在「图片生成」模式中引用结果</p>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleRefImageFile} />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>视频描述</label>
                  <textarea
                    value={i2vPrompt}
                    onChange={e => setI2vPrompt(e.target.value)}
                    placeholder="描述参考图中的画面变化和运动方式..."
                    rows={3}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: '10px',
                      border: '1px solid var(--border)', background: 'var(--surface2)',
                      color: 'var(--text)', fontSize: '12px', resize: 'none', outline: 'none',
                    }}
                  />
                </div>

                <ParamGroup label="时长">
                  {DURATIONS.map(d => (
                    <PillBtn key={d} active={duration === d} onClick={() => setDuration(d)}>{d}s</PillBtn>
                  ))}
                </ParamGroup>
                <ParamGroup label="分辨率">
                  {RESOLUTIONS.map(r => (
                    <PillBtn key={r} active={resolution === r} onClick={() => setResolution(r)}>{r}</PillBtn>
                  ))}
                </ParamGroup>
                <ParamGroup label="画面比例">
                  {SIZES.map(s => (
                    <PillBtn key={s} active={videoSize === s} onClick={() => setVideoSize(s)}>{s}</PillBtn>
                  ))}
                </ParamGroup>

                <GenerateBtn onClick={handleImage2Video} disabled={generating || !i2vPrompt.trim() || !hasSeedanceKey()} loading={generating}>
                  🖼️ 图生视频
                </GenerateBtn>
                {!hasSeedanceKey() && <p style={{ fontSize: '10px', color: '#f87171', textAlign: 'center' }}>⚠️ 请先在上方配置 Seedance API Key</p>}
                <p style={{ fontSize: '10px', color: 'var(--text2)', textAlign: 'center' }}>
                  上传参考图片辅助构思，用文字描述画面变化
                </p>
              </div>
            )}

            {/* ===== AI 脚本 ===== */}
            {mode === 'ai-script' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI 视频脚本助手</div>
                <p style={{ fontSize: '11px', color: 'var(--text2)', lineHeight: 1.6 }}>
                  告诉 AI 你的创意想法，自动生成可用的视频描述脚本
                </p>

                {/* 快捷模板 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {SCRIPT_TEMPLATES.map(t => (
                    <button key={t.label} onClick={() => setChatInput(t.prompt)}
                      style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '10px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer' }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* 对话区 */}
                <div style={{
                  flex: 1, minHeight: '200px', maxHeight: '320px', overflow: 'auto',
                  padding: '10px', borderRadius: '10px', background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                }}>
                  {chatMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text2)', fontSize: '12px' }}>
                      输入创意想法，AI 为你编写视频脚本
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <div key={i} style={{
                        marginBottom: '10px',
                        display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      }}>
                        <div style={{
                          maxWidth: '85%', padding: '8px 12px', borderRadius: '10px',
                          fontSize: '11px', lineHeight: 1.6,
                          background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                          color: msg.role === 'user' ? '#fff' : 'var(--text)',
                          border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                        }}>
                          {msg.content}
                          {msg.role === 'assistant' && (
                            <button onClick={() => useRefScript(msg.content)}
                              style={{ display: 'block', marginTop: '6px', padding: '3px 10px', borderRadius: '6px', fontSize: '10px', background: 'rgba(255,76,139,0.15)', color: '#ff7aad', border: '1px solid rgba(255,76,139,0.25)', cursor: 'pointer' }}>
                              → 用于文生视频
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {chatLoading && (
                    <div style={{ fontSize: '11px', color: 'var(--text2)', padding: '4px 0' }}>
                      <span className="animate-pulse">AI 正在编写脚本...</span>
                    </div>
                  )}
                </div>

                {/* 输入 */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                    placeholder="输入你的创意想法..."
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: '10px',
                      border: '1px solid var(--border)', background: 'var(--surface2)',
                      color: 'var(--text)', fontSize: '12px', outline: 'none',
                    }}
                  />
                  <button onClick={handleSendChat} disabled={chatLoading || !chatInput.trim() || !hasSeedKey()}
                    style={{
                      padding: '8px 14px', borderRadius: '10px', border: 'none',
                      background: 'var(--accent)', color: '#fff', fontSize: '12px',
                      cursor: chatLoading || !hasSeedKey() ? 'not-allowed' : 'pointer', fontWeight: 700,
                      opacity: chatLoading || !chatInput.trim() || !hasSeedKey() ? 0.5 : 1,
                    }}>
                    发送
                  </button>
                </div>
              </div>
            )}

            {/* ===== 图片生成 ===== */}
            {mode === 'text2image' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>图片描述</label>
                  <textarea
                    value={imgPrompt}
                    onChange={e => setImgPrompt(e.target.value)}
                    placeholder="描述你想生成的图片内容..."
                    rows={4}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: '10px',
                      border: '1px solid var(--border)', background: 'var(--surface2)',
                      color: 'var(--text)', fontSize: '12px', resize: 'none', outline: 'none',
                    }}
                  />
                </div>

                <ParamGroup label="图片尺寸">
                  {IMAGE_SIZES.map(s => (
                    <PillBtn key={s} active={imgSize === s} onClick={() => setImgSize(s)}>{s}</PillBtn>
                  ))}
                </ParamGroup>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text2)' }}>水印</label>
                  <button onClick={() => setImgWatermark(!imgWatermark)}
                    style={{
                      width: '36px', height: '20px', borderRadius: '10px', border: 'none',
                      background: imgWatermark ? 'var(--accent)' : 'var(--surface2)',
                      cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
                    }}>
                    <span style={{
                      position: 'absolute', top: '2px', left: imgWatermark ? '18px' : '2px',
                      width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                      transition: 'all 0.2s',
                    }} />
                  </button>
                </div>

                <GenerateBtn onClick={handleText2Image} disabled={generating || !imgPrompt.trim() || !hasSeedreamKey()} loading={generating}>
                  🎨 生成图片
                </GenerateBtn>
                {!hasSeedreamKey() && <p style={{ fontSize: '10px', color: '#f87171', textAlign: 'center' }}>⚠️ 请先在上方配置 Seedream API Key</p>}
                <p style={{ fontSize: '10px', color: 'var(--text2)', textAlign: 'center' }}>
                  Seedream 5.0 Lite · 可作为图生视频参考帧
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* ===== 右侧：结果展示 ===== */}
        <main style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
          {tasks.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '320px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎬</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>还没有创作任务</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>在左侧选择创作模式，开始你的 AI 创作</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>创作结果</h2>
                {tasks.some(t => t.status === 'succeeded' || t.status === 'failed') && (
                  <button onClick={clearCompleted} style={{ fontSize: '10px', color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    清空已完成
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onDownloadVideo={url => downloadFile(url, `video_${task.id}.mp4`)}
                    onDownloadImage={url => downloadFile(url, `image_${task.id}.png`)}
                    onUseRefImage={useRefImage}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

// ===== 子组件 =====

function ParamGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>{label}</label>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function PillBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: active ? 700 : 500,
      border: 'none', cursor: 'pointer', transition: 'all 0.15s',
      background: active ? 'var(--accent)' : 'var(--surface2)',
      color: active ? '#fff' : 'var(--text2)',
    }}>
      {children}
    </button>
  )
}

function GenerateBtn({ onClick, disabled, loading, children }: { onClick: () => void; disabled: boolean; loading: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', padding: '12px', borderRadius: '12px',
      background: 'var(--accent)', color: '#fff', fontSize: '14px', fontWeight: 700,
      border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
    }}>
      {loading ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} />
          提交中...
        </span>
      ) : children}
    </button>
  )
}

function TaskCard({ task, onDownloadVideo, onDownloadImage, onUseRefImage }: {
  task: VideoTask
  onDownloadVideo: (url: string) => void
  onDownloadImage: (url: string) => void
  onUseRefImage: (url: string) => void
}) {
  const modeLabel = MODES.find(m => m.key === task.mode)?.label || task.mode

  return (
    <div style={{
      borderRadius: '14px', border: '1px solid var(--border)',
      background: 'var(--surface)', overflow: 'hidden',
    }}>
      {/* 头部 */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {task.prompt}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '10px', color: 'var(--text2)' }}>
            <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'var(--surface2)' }}>{modeLabel}</span>
            {task.duration && <span>{task.duration}s</span>}
            {task.resolution && <span>{task.resolution}</span>}
            {task.size && <span>{task.size}</span>}
            <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
          </div>
        </div>
        <StatusBadge status={task.status} />
      </div>

      {/* 结果内容 */}
      {(task.status === 'succeeded' && (task.videoUrl || task.imageUrl)) && (
        <div style={{ padding: '0 16px 16px' }}>
          {task.videoUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <video src={task.videoUrl} controls style={{ width: '100%', borderRadius: '10px', maxHeight: '280px', background: '#000' }} />
              <button onClick={() => onDownloadVideo(task.videoUrl!)}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'var(--accent)', color: '#fff', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                ↓ 下载视频
              </button>
            </div>
          )}
          {task.imageUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <img src={task.imageUrl} alt={task.prompt} style={{ width: '100%', borderRadius: '10px', maxHeight: '280px', objectFit: 'contain', background: '#111' }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => onDownloadImage(task.imageUrl!)}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'var(--accent)', color: '#fff', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                  ↓ 下载图片
                </button>
                <button onClick={() => onUseRefImage(task.imageUrl!)}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'var(--surface2)', color: '#ff7aad', fontSize: '12px', fontWeight: 700, border: '1px solid rgba(255,76,139,0.3)', cursor: 'pointer' }}>
                  → 用于图生视频
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 进度条 */}
      {(task.status === 'pending' || task.status === 'running') && (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'var(--surface2)' }}>
            <div style={{
              height: '4px', borderRadius: '2px', background: 'var(--accent)',
              width: task.status === 'pending' ? '20%' : '60%',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
          </div>
          <p style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '6px', textAlign: 'center' }}>
            {task.status === 'pending' ? '排队中...' : '生成中，通常需要 1-3 分钟...'}
          </p>
        </div>
      )}

      {/* 失败信息 */}
      {task.status === 'failed' && task.error && (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '11px', color: '#f87171' }}>
            {task.error}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: VideoTask['status'] }) {
  const config: Record<string, { bg: string; color: string; text: string }> = {
    pending: { bg: 'rgba(234,179,8,0.15)', color: '#facc15', text: '等待中' },
    running: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', text: '生成中' },
    succeeded: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80', text: '✓ 完成' },
    failed: { bg: 'rgba(239,68,68,0.15)', color: '#f87171', text: '✗ 失败' },
  }
  const c = config[status] || config.pending
  return (
    <span style={{
      fontSize: '10px', padding: '3px 10px', borderRadius: '999px',
      background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>
      {status === 'running' && (
        <span style={{ display: 'inline-block', width: '8px', height: '8px', border: '1.5px solid rgba(96,165,250,0.4)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: '4px', verticalAlign: 'middle' }} />
      )}
      {c.text}
    </span>
  )
}
