import React, { useState, useEffect, useCallback, useRef } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import Compress from './pages/Compress'
import Convert from './pages/Convert'
import Crop from './pages/Crop'
import Watermark from './pages/Watermark'
import Resize from './pages/Resize'
import Palette from './pages/Palette'
import Picsum from './pages/Picsum'
import Avatar from './pages/Avatar'
import VideoCreate from './pages/VideoCreate'
import Outpaint from './pages/Outpaint'
import ToWebp from './pages/ToWebp'
import VideoDownload from './pages/VideoDownload'
import WatermarkRemover from './pages/WatermarkRemover'
import GPTImage from './pages/GPTImage'
import './index.css'

// 快影 Logo
const KwaiYingLogo = () => (
  <img src="/logo.webp" alt="快影" width="28" height="28" style={{ objectFit: 'contain' }} />
)

// ===== 默认工具数据 =====
const defaultTools = [
  { path: '/gpt-image', icon: '✦', name: 'AI 生图', desc: 'GPT-Image-2 文生图，支持选择尺寸和数量', category: 'ai' },
  { path: '/outpaint', icon: '📐', name: '比例修改', desc: 'AI 智能修改图片比例，扩展背景区域（暂无额度，暂不可用）', category: 'ai' },
  { path: '/video', icon: '🎬', name: '视频创作', desc: '文生视频、图生视频、AI 脚本、图片生成（暂无额度，暂不可用）', category: 'ai' },
  { path: '/to-webp', icon: '🎞️', name: '视频转动图', desc: '视频转 WebP/GIF 动图，230×230 默认，浏览器本地处理', category: 'ai' },
  { path: '/video-download', icon: '📥', name: '视频下载', desc: '批量解析下载短视频（抖音/快手/B站等）', category: 'ai' },
  { path: '/compress', icon: '🗜️', name: '图片压缩', desc: '调整质量压缩图片，显示压缩前后对比', category: 'image' },
  { path: '/convert', icon: '🔄', name: '格式转换', desc: '图片批量格式互转（JPG/PNG/WebP）', category: 'image' },
  { path: '/crop', icon: '✂️', name: '自由裁剪', desc: '拖拽选区自由裁剪，支持锁定比例', category: 'image' },
  { path: '/watermark', icon: '💧', name: '添加水印', desc: '自定义文字水印，调整位置和透明度', category: 'image' },
  { path: '/watermark-remove', icon: '🧹', name: '去水印', desc: '标记水印区域，智能修复去除水印', category: 'image' },
  { path: '/resize', icon: '📐', name: '尺寸调整', desc: '精确调整宽高，支持预设尺寸', category: 'image' },
  { path: '/palette', icon: '🎨', name: '颜色提取', desc: '自动提取图片主色调，生成调色板', category: 'image' },
  { path: '/picsum', icon: '🌄', name: '占位图生成', desc: 'Lorem Picsum 高质量随机风景照', category: 'image' },
  { path: '/avatar', icon: '👤', name: '头像生成', desc: 'DiceBear 多种风格头像', category: 'image' },
]

const STORAGE_KEY_ZONES = 'ky-tools-zones'

interface ToolZones {
  frequent: typeof defaultTools
  infrequent: typeof defaultTools
}

function loadToolZones(): ToolZones {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_ZONES)
    if (!saved) {
      // Default: first 4 tools are frequent, rest are infrequent
      return {
        frequent: defaultTools.slice(0, 4),
        infrequent: defaultTools.slice(4),
      }
    }
    const { frequent: fPaths, infrequent: iPaths } = JSON.parse(saved) as { frequent: string[]; infrequent: string[] }
    const frequent = fPaths.map(p => defaultTools.find(t => t.path === p)).filter(Boolean) as typeof defaultTools
    const infrequent = iPaths.map(p => defaultTools.find(t => t.path === p)).filter(Boolean) as typeof defaultTools
    // Add any new tools not yet saved (put in infrequent)
    const allSaved = [...fPaths, ...iPaths]
    const newTools = defaultTools.filter(t => !allSaved.includes(t.path))
    return { frequent, infrequent: [...infrequent, ...newTools] }
  } catch {
    return {
      frequent: defaultTools.slice(0, 4),
      infrequent: defaultTools.slice(4),
    }
  }
}

function saveToolZones(zones: ToolZones) {
  localStorage.setItem(STORAGE_KEY_ZONES, JSON.stringify({
    frequent: zones.frequent.map(t => t.path),
    infrequent: zones.infrequent.map(t => t.path),
  }))
}

// ===== Two-zone (frequent/infrequent) drag grid =====
function ZoneToolGrid({ zones, onZonesChange }: {
  zones: ToolZones
  onZonesChange: (newZones: ToolZones) => void
}) {
  const navigate = useNavigate()
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const animating = useRef(false)
  const didDrag = useRef(false)
  const prevPositions = useRef<Map<string, { x: number; y: number }>>(new Map())

  // Which item is being dragged (identified by tool path)
  const [dragPath, setDragPath] = useState<string | null>(null)
  // Which slot is hovered (zone + index)
  const [dropTarget, setDropTarget] = useState<{ zone: 'frequent' | 'infrequent'; idx: number } | null>(null)

  const recordPositions = useCallback(() => {
    const positions = new Map<string, { x: number; y: number }>()
    for (const [path, el] of itemRefs.current.entries()) {
      const rect = el.getBoundingClientRect()
      positions.set(path, { x: rect.left, y: rect.top })
    }
    prevPositions.current = positions
  }, [])

  const animateReorder = useCallback(() => {
    if (animating.current) return
    animating.current = true
    for (const [path, el] of itemRefs.current.entries()) {
      const prev = prevPositions.current.get(path)
      if (!prev) continue
      const rect = el.getBoundingClientRect()
      const dx = prev.x - rect.left
      const dy = prev.y - rect.top
      if (dx === 0 && dy === 0) continue
      el.style.transform = `translate(${dx}px, ${dy}px)`
      el.style.transition = 'none'
      el.style.zIndex = '10'
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const [, el] of itemRefs.current.entries()) {
          el.style.transition = 'transform 0.35s cubic-bezier(0.2, 0, 0, 1)'
          el.style.transform = 'translate(0, 0)'
          el.style.zIndex = ''
        }
        setTimeout(() => {
          animating.current = false
          for (const [, el] of itemRefs.current.entries()) {
            el.style.transition = ''
            el.style.transform = ''
            el.style.zIndex = ''
          }
        }, 380)
      })
    })
  }, [])

  const handleDragStart = useCallback((_e: React.DragEvent, path: string) => {
    recordPositions()
    setDragPath(path)
    didDrag.current = true
  }, [recordPositions])

  const handleDragOver = useCallback((e: React.DragEvent, zone: 'frequent' | 'infrequent', idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget({ zone, idx })
  }, [])

  const handleDrop = useCallback((_e: React.DragEvent, zone: 'frequent' | 'infrequent', idx: number) => {
    if (!dragPath) {
      setDragPath(null)
      setDropTarget(null)
      return
    }

    // Find the dragged tool
    const dragTool = defaultTools.find(t => t.path === dragPath)
    if (!dragTool) {
      setDragPath(null)
      setDropTarget(null)
      return
    }

    // Remove from whichever zone it's currently in
    let newFrequent = zones.frequent.filter(t => t.path !== dragPath)
    let newInfrequent = zones.infrequent.filter(t => t.path !== dragPath)

    // Insert into target zone at target index
    if (zone === 'frequent') {
      newFrequent.splice(idx, 0, dragTool)
    } else {
      newInfrequent.splice(idx, 0, dragTool)
    }

    onZonesChange({ frequent: newFrequent, infrequent: newInfrequent })
    setDragPath(null)
    setDropTarget(null)
  }, [dragPath, zones, onZonesChange])

  const handleDragEnd = useCallback(() => {
    setDragPath(null)
    setDropTarget(null)
    setTimeout(() => { didDrag.current = false }, 100)
  }, [])

  // FLIP animation when zones change
  useEffect(() => {
    if (prevPositions.current.size > 0) {
      animateReorder()
    }
  }, [zones, animateReorder])

  const renderCard = (tool: typeof defaultTools[0], zone: 'frequent' | 'infrequent', idx: number) => (
    <div
      key={tool.path}
      ref={el => { if (el) itemRefs.current.set(tool.path, el) }}
      draggable
      onDragStart={e => handleDragStart(e, tool.path)}
      onDragOver={e => handleDragOver(e, zone, idx)}
      onDrop={e => handleDrop(e, zone, idx)}
      onDragEnd={handleDragEnd}
      onClick={() => { if (!didDrag.current) navigate(tool.path) }}
      className="ky-card"
      style={{
        opacity: dragPath === tool.path ? 0.3 : 1,
        transition: animating.current ? 'none' : 'opacity 0.15s ease',
        cursor: 'grab',
        borderRadius: 'var(--radius)',
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
        position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute',
        top: '6px',
        left: '8px',
        fontSize: '10px',
        color: 'rgba(255,255,255,0.15)',
        transition: 'color 0.15s',
        pointerEvents: 'none',
      }}
      className="drag-handle"
      >⋮⋮</div>
      <div style={{
        width: '100%',
        aspectRatio: '2/1',
        background: 'linear-gradient(135deg, rgba(255,76,139,.12) 0%, rgba(255,140,61,.08) 50%, rgba(86,207,178,.06) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '36px',
        borderBottom: '1px solid var(--border)',
        position: 'relative',
        flexShrink: 0,
      }}>
        {tool.icon}
      </div>
      <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: '6px', minHeight: '68px' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{tool.name}</div>
        <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{tool.desc}</div>
      </div>
    </div>
  )

  const renderGrid = (items: typeof defaultTools, zone: 'frequent' | 'infrequent') => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      gap: '20px',
    }}>
      {items.map((tool, idx) => renderCard(tool, zone, idx))}
      {/* Empty drop target: allows dropping into an empty zone */}
      {items.length === 0 && (
        <div
          onDragOver={e => { e.preventDefault(); setDropTarget({ zone, idx: 0 }) }}
          onDrop={e => handleDrop(e, zone, 0)}
          style={{
            padding: '40px',
            borderRadius: '12px',
            border: dropTarget?.zone === zone ? '2px dashed var(--accent)' : '1px dashed rgba(255,255,255,0.08)',
            textAlign: 'center',
            color: 'var(--text2)',
            fontSize: '12px',
          }}
        >
          拖拽卡片到这里
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Frequent zone */}
      <div>
        <div style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text2)',
          marginBottom: '12px', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ color: 'var(--accent)' }}>★</span> 常用工具
          <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, fontSize: '10px' }}>
            {zones.frequent.length} 个
          </span>
        </div>
        {renderGrid(zones.frequent, 'frequent')}
      </div>

      {/* Divider */}
      <div style={{
        height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)',
      }} />

      {/* Infrequent zone */}
      <div>
        <div style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text2)',
          marginBottom: '12px', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>☆</span> 不常用工具
          <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, fontSize: '10px' }}>
            {zones.infrequent.length} 个
          </span>
        </div>
        {renderGrid(zones.infrequent, 'infrequent')}
      </div>
    </div>
  )
}

// ===== 首页 =====
function Home() {
  const [zones, setZones] = useState(loadToolZones)

  useEffect(() => { saveToolZones(zones) }, [zones])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 48px',
        height: '60px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(10,10,18,0.94)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <KwaiYingLogo />
          <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 4px' }} />
          <span className="gradient-text" style={{ fontSize: '15px', fontWeight: 700 }}>快影</span>
          <span style={{ fontSize: '11px', color: 'var(--text2)' }}>创作工具集</span>
        </div>
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          {[{ label: '工具', href: '#tools' }, { label: '关于', href: '#about' }].map(n => (
            <a key={n.label} href={n.href} style={{
              color: 'var(--text2)',
              textDecoration: 'none',
              fontSize: '12px',
              padding: '5px 12px',
              borderRadius: '8px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.target as HTMLElement).style.color = 'var(--text)'
              ;(e.target as HTMLElement).style.background = 'var(--surface2)'
            }}
            onMouseLeave={e => {
              (e.target as HTMLElement).style.color = 'var(--text2)'
              ;(e.target as HTMLElement).style.background = 'transparent'
            }}
            >{n.label}</a>
          ))}
        </nav>
      </header>

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '64px 40px 48px', position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: '900px', height: '320px',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(255,76,139,0.15) 0%, rgba(255,140,61,0.06) 45%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'rgba(255,76,139,0.1)',
          border: '1px solid rgba(255,76,139,0.2)',
          borderRadius: '999px',
          padding: '4px 14px',
          fontSize: '11px',
          color: '#ff7aad',
          marginBottom: '16px',
        }}>
          <span style={{
            width: '5px', height: '5px', borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'pulse 2s infinite',
            display: 'inline-block',
          }} />
          快影 AI 创作工具集
        </div>
        <h1 style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', marginBottom: '10px' }}>
          快影创作工具集
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text2)', margin: '0 auto' }}>
          拖拽卡片调整顺序 · 跨区域拖拽归类 · 顺序自动保存
        </p>
      </div>

      {/* Tools */}
      <div id="tools" style={{ maxWidth: '1320px', margin: '0 auto', padding: '0 48px 80px' }}>
        <ZoneToolGrid zones={zones} onZonesChange={setZones} />
      </div>

      {/* Footer */}
      <footer id="about" style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '28px 0 36px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '11px', color: 'var(--text2)' }}>
          快影创作工具集 &nbsp;×&nbsp; 快影 AI 产线 &nbsp;|&nbsp; 维护：张峻烨
        </p>
      </footer>
    </div>
  )
}

// ===== 工具页面包围组件 =====
function ToolLayout({ children, title, desc, backPath = '/' }: {
  children: React.ReactNode
  title: string
  desc: string
  backPath?: string
}) {
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
        <Link to={backPath} style={{
          display: 'flex', alignItems: 'center', gap: '9px',
          textDecoration: 'none',
        }}>
          <KwaiYingLogo />
          <span className="gradient-text" style={{ fontSize: '14px', fontWeight: 700 }}>快影</span>
        </Link>
        <div style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
        <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{title}</span>
        <Link to={backPath} style={{
          marginLeft: 'auto',
          fontSize: '12px',
          color: 'var(--text2)',
          textDecoration: 'none',
          padding: '5px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          transition: 'all 0.15s',
        }}>
          ← 返回工具集
        </Link>
      </header>

      {/* Page content */}
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 32px 80px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>{title}</h1>
        <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '32px' }}>{desc}</p>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '32px',
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ===== Full-screen editor layout (no card wrapper) =====
function WatermarkRemoverLayout() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
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
        <Link to="/" style={{
          display: 'flex', alignItems: 'center', gap: '9px',
          textDecoration: 'none',
        }}>
          <KwaiYingLogo />
          <span className="gradient-text" style={{ fontSize: '14px', fontWeight: 700 }}>快影</span>
        </Link>
        <div style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
        <span style={{ fontSize: '13px', color: 'var(--text2)' }}>🧹 去水印</span>
        <Link to="/" style={{
          marginLeft: 'auto',
          fontSize: '12px',
          color: 'var(--text2)',
          textDecoration: 'none',
          padding: '5px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          transition: 'all 0.15s',
        }}>
          ← 返回工具集
        </Link>
      </header>
      <div style={{ padding: '16px 32px' }}>
        <WatermarkRemover />
      </div>
    </div>
  )
}

// ===== App =====
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/video" element={<VideoCreate />} />
        <Route path="/to-webp" element={<ToWebp />} />
        <Route path="/video-download" element={<ToolLayout title="📥 视频下载" desc="批量解析下载短视频（抖音/快手/TikTok/B站等）"><VideoDownload /></ToolLayout>} />
        <Route path="/outpaint" element={<ToolLayout title="📐 比例修改" desc="AI 智能修改图片比例，扩展背景区域"><Outpaint /></ToolLayout>} />
        <Route path="/compress" element={<ToolLayout title="🗜️ 图片压缩" desc="调整质量压缩图片，显示压缩前后对比"><Compress /></ToolLayout>} />
        <Route path="/convert" element={<ToolLayout title="🔄 格式转换" desc="图片批量格式互转（JPG / PNG / WebP）"><Convert /></ToolLayout>} />
        <Route path="/crop" element={<ToolLayout title="✂️ 自由裁剪" desc="拖拽选区自由裁剪，支持锁定比例"><Crop /></ToolLayout>} />
        <Route path="/watermark" element={<ToolLayout title="💧 添加水印" desc="自定义文字水印，调整位置和透明度"><Watermark /></ToolLayout>} />
        <Route path="/watermark-remove" element={<WatermarkRemoverLayout />} />
        <Route path="/resize" element={<ToolLayout title="📐 尺寸调整" desc="精确调整宽高，支持预设尺寸"><Resize /></ToolLayout>} />
        <Route path="/palette" element={<ToolLayout title="🎨 颜色提取" desc="自动提取图片主色调，生成调色板"><Palette /></ToolLayout>} />
        <Route path="/picsum" element={<ToolLayout title="🌄 占位图生成" desc="Lorem Picsum 高质量随机风景照"><Picsum /></ToolLayout>} />
        <Route path="/gpt-image" element={<ToolLayout title="✦ AI 生图" desc="GPT-Image-2 文生图，支持选择尺寸和数量"><GPTImage /></ToolLayout>} />
        <Route path="/avatar" element={<ToolLayout title="👤 头像生成" desc="DiceBear 多种风格头像"><Avatar /></ToolLayout>} />
      </Routes>
    </BrowserRouter>
  )
}