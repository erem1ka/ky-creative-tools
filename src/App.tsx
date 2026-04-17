import React from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Compress from './pages/Compress'
import Convert from './pages/Convert'
import Crop from './pages/Crop'
import Watermark from './pages/Watermark'
import Resize from './pages/Resize'
import Palette from './pages/Palette'
import Picsum from './pages/Picsum'
import Avatar from './pages/Avatar'
import Outpaint from './pages/Outpaint'
import './index.css'

// ===== 工具数据 =====
const tools = [
  { path: '/outpaint', icon: '🖼️', name: '比例扩展', desc: 'AI 智能扩展图片背景，支持多种比例', badge: '需 API Key' },
  { path: '/compress', icon: '🗜️', name: '图片压缩', desc: '调整质量压缩图片，显示压缩前后对比' },
  { path: '/convert', icon: '🔄', name: '格式转换', desc: '图片 / 视频批量格式互转' },
  { path: '/crop', icon: '✂️', name: '自由裁剪', desc: '拖拽选区自由裁剪，支持锁定比例' },
  { path: '/watermark', icon: '💧', name: '添加水印', desc: '自定义文字水印，调整位置和透明度' },
  { path: '/resize', icon: '📐', name: '尺寸调整', desc: '精确调整宽高，支持预设尺寸' },
  { path: '/palette', icon: '🎨', name: '颜色提取', desc: '自动提取图片主色调，生成调色板' },
  { path: '/picsum', icon: '🌄', name: '占位图生成', desc: 'Lorem Picsum 高质量随机风景照' },
  { path: '/avatar', icon: '👤', name: '头像生成', desc: 'DiceBear 多种风格头像' },
]

// ===== 首页 =====
function Home() {
  const [theme, setTheme] = React.useState(localStorage.getItem('theme') || 'dark')

  React.useEffect(() => {
    document.body.className = theme === 'light' ? 'theme-light' : ''
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6">
      <header className="w-full max-w-5xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛠️</span>
          <h1 className="text-xl font-bold">图像工具集</h1>
        </div>
        <button
          onClick={toggleTheme}
          className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] hover:text-[var(--text)] transition"
        >
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
      </header>

      <p className="text-sm text-[var(--text2)] mb-8 text-center">常用图片处理在线工具集，数据全部在本地处理</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-5xl">
        {tools.map(tool => (
          <Link
            key={tool.path}
            to={tool.path}
            className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] transition group"
          >
            <div className="text-3xl mb-3">{tool.icon}</div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="font-bold text-base">{tool.name}</h2>
              {tool.badge && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--danger)]/20 text-[var(--danger)]">
                  {tool.badge}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text2)] leading-relaxed">{tool.desc}</p>
          </Link>
        ))}
      </div>

      <footer className="mt-12 text-xs text-[var(--text2)]">
        作者：张峻烨
      </footer>
    </div>
  )
}

// ===== 工具页面包围组件 =====
function ToolLayout({ children, title, desc, backPath = '/' }: { children: React.ReactNode, title: string, desc: string, backPath?: string }) {
  const [theme, setTheme] = React.useState(localStorage.getItem('theme') || 'dark')

  React.useEffect(() => {
    document.body.className = theme === 'light' ? 'theme-light' : ''
  }, [theme])

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6">
      <header className="w-full max-w-3xl flex items-center gap-3 mb-6">
        <Link to={backPath} className="text-sm text-[var(--text2)] hover:text-[var(--text)] transition">
          ← 返回工具集
        </Link>
        <div className="ml-auto" />
        <button
          onClick={() => {
            const t = theme === 'dark' ? 'light' : 'dark'
            setTheme(t)
            document.body.className = t === 'light' ? 'theme-light' : ''
            localStorage.setItem('theme', t)
          }}
          className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] hover:text-[var(--text)] transition"
        >
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
      </header>

      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-sm text-[var(--text2)] mb-8 text-center">{desc}</p>

      <div className="w-full max-w-3xl p-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        {children}
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
        <Route path="/outpaint" element={<ToolLayout title="🖼️ 比例扩展" desc="AI 智能扩展图片背景，支持多种比例"><Outpaint /></ToolLayout>} />
        <Route path="/compress" element={<ToolLayout title="🗜️ 图片压缩" desc="调整质量压缩图片，显示压缩前后对比"><Compress /></ToolLayout>} />
        <Route path="/convert" element={<ToolLayout title="🔄 格式转换" desc="图片 / 视频批量格式互转"><Convert /></ToolLayout>} />
        <Route path="/crop" element={<ToolLayout title="✂️ 自由裁剪" desc="拖拽选区自由裁剪，支持锁定比例"><Crop /></ToolLayout>} />
        <Route path="/watermark" element={<ToolLayout title="💧 添加水印" desc="自定义文字水印，调整位置和透明度"><Watermark /></ToolLayout>} />
        <Route path="/resize" element={<ToolLayout title="📐 尺寸调整" desc="精确调整宽高，支持预设尺寸"><Resize /></ToolLayout>} />
        <Route path="/palette" element={<ToolLayout title="🎨 颜色提取" desc="自动提取图片主色调，生成调色板"><Palette /></ToolLayout>} />
        <Route path="/picsum" element={<ToolLayout title="🌄 占位图生成" desc="Lorem Picsum 高质量随机风景照"><Picsum /></ToolLayout>} />
        <Route path="/avatar" element={<ToolLayout title="👤 头像生成" desc="DiceBear 多种风格头像"><Avatar /></ToolLayout>} />
      </Routes>
    </BrowserRouter>
  )
}
