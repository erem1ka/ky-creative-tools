import { useState, useRef } from 'react'
import { showToast, downloadBlob, formatSize, generateFilename } from '../lib/utils'
import {
  parseVideo, extractUrls, detectPlatform, getApiBase, saveApiBase,
  downloadWithProgress, getHistory, addToHistory, clearHistory,
  VideoInfo, ParseProgress, HistoryItem,
} from '../lib/video-parser'

// ===== Types =====

interface ResultItem {
  id: string
  url: string
  platform: string
  platformIcon: string
  status: 'parsing' | 'done' | 'error' | 'downloading'
  info?: VideoInfo
  error?: string
  downloadProgress?: number
  resultBlob?: Blob
  fileSize?: number
  parseLog?: ParseProgress[]
}

const DEFAULT_API_BASE = 'http://localhost:80'

export default function VideoDownload() {
  const [apiBase, setApiBase] = useState(() => getApiBase())
  const [inputText, setInputText] = useState('')
  const [results, setResults] = useState<ResultItem[]>([])
  const [parsing, setParsing] = useState(false)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>(getHistory())
  const [showApiConfig, setShowApiConfig] = useState(false)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Auto-detect URL count
  const urlCount = extractUrls(inputText).length

  // Parse all URLs
  const startParse = async () => {
    const urls = extractUrls(inputText)
    if (urls.length === 0) {
      showToast('未检测到有效链接', 'error')
      return
    }

    setParsing(true)
    const newResults: ResultItem[] = urls.map(url => {
      const p = detectPlatform(url)
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url,
        platform: p.name,
        platformIcon: p.icon,
        status: 'parsing',
        parseLog: [],
      }
    })
    setResults(newResults)

    for (const item of newResults) {
      try {
        const info = await parseVideo(
          item.url,
          (progress) => {
            setResults(prev => prev.map(r => r.id === item.id ? {
              ...r,
              parseLog: [...(r.parseLog || []), progress],
            } : r))
          },
          apiBase !== DEFAULT_API_BASE ? apiBase : undefined,
        )

        setResults(prev => prev.map(r => r.id === item.id ? {
          ...r,
          status: 'done',
          info,
        } : r))

        // 添加到历史
        addToHistory({
          id: item.id,
          url: item.url,
          title: info.title,
          platform: info.platform,
          coverUrl: info.coverUrl,
          timestamp: Date.now(),
        })
        setHistory(getHistory())
      } catch (err: any) {
        setResults(prev => prev.map(r => r.id === item.id ? {
          ...r,
          status: 'error',
          error: err.message || '解析失败',
        } : r))
      }
    }

    setParsing(false)
    const successCount = newResults.filter(r => r.status === 'done').length
    if (successCount > 0) {
      showToast(`解析完成：${successCount}/${urls.length} 成功`)
    } else {
      showToast('所有链接解析失败', 'error')
    }
  }

  // Download a single video with progress
  const downloadVideo = async (item: ResultItem) => {
    if (!item.info?.videoUrl) {
      showToast('无视频地址', 'error')
      return
    }

    setResults(prev => prev.map(r => r.id === item.id ? { ...r, status: 'downloading', downloadProgress: 0 } : r))

    try {
      // Try direct download, fallback to CORS proxy
      let blob: Blob
      try {
        blob = await downloadWithProgress(item.info.videoUrl, (percent) => {
          setResults(prev => prev.map(r => r.id === item.id ? { ...r, downloadProgress: percent } : r))
        })
      } catch {
        // Direct fetch failed, try with CORS proxy
        const proxies = [
          'https://api.allorigins.win/raw?url=',
          'https://corsproxy.io/?',
        ]
        for (const proxy of proxies) {
          try {
            blob = await downloadWithProgress(proxy + encodeURIComponent(item.info.videoUrl), (percent) => {
              setResults(prev => prev.map(r => r.id === item.id ? { ...r, downloadProgress: percent } : r))
            })
            break
          } catch {
            continue
          }
        }
        if (!blob!) throw new Error('下载失败：直连和代理均不可用')
      }

      const filename = generateFilename((item.info.title || 'video').replace(/[^\w\u4e00-\u9fff]/g, '_'), 'mp4')
      downloadBlob(blob, filename)

      setResults(prev => prev.map(r => r.id === item.id ? {
        ...r,
        status: 'done',
        resultBlob: blob,
        fileSize: blob.size,
        downloadProgress: 100,
      } : r))
      showToast('下载成功')
    } catch (err: any) {
      setResults(prev => prev.map(r => r.id === item.id ? {
        ...r,
        status: 'error',
        error: err.message || '下载失败',
      } : r))
      showToast(err.message || '下载失败', 'error')
    }
  }

  // Download images from image set
  const downloadImages = async (item: ResultItem) => {
    if (!item.info?.images?.length) {
      showToast('无图片地址', 'error')
      return
    }

    setResults(prev => prev.map(r => r.id === item.id ? { ...r, status: 'downloading', downloadProgress: 0 } : r))

    try {
      const total = item.info.images.length
      let downloaded = 0

      for (const imgUrl of item.info.images) {
        try {
          const response = await fetch(imgUrl)
          if (response.ok) {
            const blob = await response.blob()
            const idx = item.info.images!.indexOf(imgUrl) + 1
            downloadBlob(blob, generateFilename(`${item.info.title}_${idx}`, 'jpg'))
            downloaded++
          }
        } catch {
          // Try CORS proxy
          for (const proxy of ['https://api.allorigins.win/raw?url=', 'https://corsproxy.io/?']) {
            try {
              const response = await fetch(proxy + encodeURIComponent(imgUrl))
              if (response.ok) {
                const blob = await response.blob()
                const idx = item.info.images!.indexOf(imgUrl) + 1
                downloadBlob(blob, generateFilename(`${item.info.title}_${idx}`, 'jpg'))
                downloaded++
                break
              }
            } catch { continue }
          }
        }
        setResults(prev => prev.map(r => r.id === item.id ? {
          ...r, downloadProgress: Math.round(downloaded / total * 100)
        } : r))
      }

      setResults(prev => prev.map(r => r.id === item.id ? {
        ...r, status: 'done', downloadProgress: 100,
      } : r))
      showToast(`已下载 ${downloaded}/${total} 张图片`)
    } catch (err: any) {
      setResults(prev => prev.map(r => r.id === item.id ? {
        ...r, status: 'error', error: err.message || '下载失败',
      } : r))
    }
  }

  // Download all
  const downloadAll = async () => {
    const readyItems = results.filter(r => r.status === 'done' && r.info?.videoUrl && !r.resultBlob)
    if (readyItems.length === 0) {
      showToast('没有可下载的视频', 'error')
      return
    }
    setDownloadingAll(true)
    for (const item of readyItems) {
      await downloadVideo(item)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    setDownloadingAll(false)
  }

  // Click history item to re-parse
  const reparseFromHistory = (item: HistoryItem) => {
    setInputText(item.url)
    setShowHistory(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ===== API Config (collapsible) ===== */}
      <div>
        <button
          onClick={() => setShowApiConfig(!showApiConfig)}
          style={{
            fontSize: '11px', fontWeight: 600, color: 'var(--text2)',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, display: 'flex', alignItems: 'center', gap: '4px',
          }}
        >
          {showApiConfig ? '▼' : '▶'} 高级设置：自部署 API
        </button>
        {showApiConfig && (
          <div style={{
            marginTop: '10px', padding: '16px 20px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={apiBase}
                onChange={e => setApiBase(e.target.value)}
                placeholder="http://localhost:80"
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text)', fontSize: '12px', fontFamily: 'monospace',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => { saveApiBase(apiBase); showToast('已保存') }}
                style={{
                  padding: '10px 16px', borderRadius: '8px', background: 'var(--accent)',
                  color: '#fff', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer',
                }}
              >保存</button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '8px' }}>
              本工具已内置多个公开解析源，无需自部署即可使用。如需更高稳定性，可自部署 Douyin_TikTok_Download_API。
            </div>
          </div>
        )}
      </div>

      {/* ===== Input area ===== */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text2)', marginBottom: '10px', textTransform: 'uppercase' }}>
          粘贴视频链接
        </div>
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={`粘贴多条链接，支持混合平台，自动识别：
https://v.douyin.com/L4FJNR3/
7.43 pda:/ 让你在几秒之内记住我 https://v.douyin.com/L5pbfdP/
https://www.kuaishou.com/short-video/xxx
https://www.bilibili.com/video/BVxxx
https://xhslink.com/a/xxx`}
          style={{
            width: '100%', minHeight: '140px', padding: '14px',
            borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.05)', color: 'var(--text)',
            fontSize: '12px', lineHeight: 1.8, resize: 'vertical',
            outline: 'none', fontFamily: 'monospace',
          }}
        />
        <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
          <span>已检测到 {urlCount} 条链接 · 支持：抖音 / 快手 / TikTok / B站 / 小红书 / 微博 / YouTube / 皮皮虾 / 西瓜</span>
          {history.length > 0 && (
            <button onClick={() => setShowHistory(!showHistory)} style={{ fontSize: '11px', color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {showHistory ? '隐藏历史' : `历史 (${history.length})`}
            </button>
          )}
        </div>
      </div>

      {/* ===== History ===== */}
      {showHistory && history.length > 0 && (
        <div style={{
          padding: '12px', borderRadius: '12px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          maxHeight: '200px', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              最近解析记录
            </span>
            <button onClick={() => { clearHistory(); setHistory([]); showToast('历史已清空') }} style={{ fontSize: '10px', color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer' }}>
              清空
            </button>
          </div>
          {history.map(h => (
            <div key={h.id} onClick={() => reparseFromHistory(h)} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
              borderRadius: '6px', cursor: 'pointer',
              transition: 'background 0.15s',
            }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
              {h.coverUrl ? (
                <img src={h.coverUrl} style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} alt="" />
              ) : (
                <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                  {detectPlatform(h.url).icon}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</div>
                <div style={{ fontSize: '9px', color: 'var(--text2)' }}>{h.platform} · {new Date(h.timestamp).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Parse button ===== */}
      <button
        onClick={startParse}
        disabled={parsing || urlCount === 0}
        style={{
          width: '100%', padding: '14px', borderRadius: '12px',
          background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
          color: '#fff', fontWeight: 700, fontSize: '13px',
          border: 'none', cursor: parsing || urlCount === 0 ? 'not-allowed' : 'pointer',
          opacity: parsing || urlCount === 0 ? 0.5 : 1,
        }}
      >
        {parsing ? '⏳ 解析中...' : `解析 ${urlCount} 条链接`}
      </button>

      {/* ===== Results ===== */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {results.map(item => (
            <div key={item.id} style={{
              padding: '16px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)',
              border: item.status === 'error' ? '1px solid rgba(255,91,91,0.3)'
                : item.resultBlob ? '1px solid rgba(62,207,142,0.3)'
                : '1px solid rgba(255,255,255,0.08)',
            }}>
              {/* Header: cover + info */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                {/* Cover */}
                {item.info?.coverUrl ? (
                  <div
                    onClick={() => item.info?.videoUrl && setPreviewingId(previewingId === item.id ? null : item.id)}
                    style={{ cursor: item.info?.videoUrl ? 'pointer' : 'default' }}
                  >
                    <img src={item.info.coverUrl} style={{
                      width: '80px', height: '80px', borderRadius: '8px', objectFit: 'cover',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }} alt="" />
                  </div>
                ) : (
                  <div style={{
                    width: '80px', height: '80px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '32px',
                  }}>
                    {item.platformIcon}
                  </div>
                )}

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.status === 'parsing' ? '解析中...' : item.info?.title || item.url}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '8px' }}>
                    {item.platformIcon} {item.platform}
                    {item.info?.author && <span> · {item.info.author}</span>}
                    {item.info?.resolution && <span> · {item.info.resolution}</span>}
                    {item.info?.duration && <span> · {Math.round(item.info.duration / 1000)}秒</span>}
                    {item.info?.isImageSet && <span> · 📸 图集 ({item.info.images?.length}张)</span>}
                    {item.info?.sourceName && <span> · 源: {item.info.sourceName}</span>}
                  </div>

                  {/* Parse log (during parsing) */}
                  {(item.parseLog?.length ?? 0) > 0 && (
                    <div style={{ fontSize: '10px', color: 'var(--text2)', marginBottom: '6px' }}>
                      {(item.parseLog ?? []).map((log, i) => (
                        <span key={i} style={{ marginRight: '8px' }}>
                          {log.status === 'trying' ? `⏳ ${log.sourceName}...`
                            : log.status === 'success' ? `✓ ${log.sourceName}`
                            : `✗ ${log.sourceName}`}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Error */}
                  {item.status === 'error' && (
                    <div style={{ fontSize: '11px', color: '#ff5b5b', fontWeight: 500 }}>
                      ✗ {item.error}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {item.status === 'done' && item.info?.videoUrl && !item.resultBlob && (
                    <button
                      onClick={() => downloadVideo(item)}
                      style={{
                        padding: '8px 20px', borderRadius: '8px',
                        background: 'var(--success)', color: '#fff',
                        fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer',
                      }}
                    >↓ 下载视频</button>
                  )}
                  {item.status === 'done' && item.info?.isImageSet && (
                    <button
                      onClick={() => downloadImages(item)}
                      style={{
                        padding: '8px 20px', borderRadius: '8px',
                        background: 'var(--accent)', color: '#fff',
                        fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer',
                      }}
                    >↓ 下载图集</button>
                  )}
                  {item.resultBlob && (
                    <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 700 }}>
                      ✓ 已下载 {formatSize(item.fileSize || 0)}
                    </span>
                  )}
                  {item.status === 'parsing' && (
                    <span style={{ fontSize: '12px', color: 'var(--accent)' }}>⏳ 解析中</span>
                  )}
                </div>
              </div>

              {/* Download progress bar */}
              {(item.status === 'downloading' || (item.downloadProgress && item.downloadProgress < 100)) && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{
                    height: '4px', borderRadius: '2px',
                    background: 'rgba(255,255,255,0.1)', overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: '2px',
                      background: 'linear-gradient(90deg, var(--accent), var(--success))',
                      width: `${item.downloadProgress || 0}%`,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '4px', textAlign: 'center' }}>
                    {item.downloadProgress || 0}%
                  </div>
                </div>
              )}

              {/* Video preview */}
              {previewingId === item.id && item.info?.videoUrl && (
                <div style={{ marginTop: '12px' }}>
                  <video
                    ref={videoRef}
                    src={item.info.videoUrl}
                    controls
                    style={{
                      width: '100%', maxHeight: '320px',
                      borderRadius: '8px', background: '#000',
                    }}
                  />
                </div>
              )}

              {/* Image set preview */}
              {item.status === 'done' && item.info?.isImageSet && item.info.images && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {item.info.images.slice(0, 6).map((img, i) => (
                    <img key={i} src={img} style={{
                      width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover',
                    }} alt="" />
                  ))}
                  {item.info.images.length > 6 && (
                    <div style={{
                      width: '60px', height: '60px', borderRadius: '4px',
                      background: 'rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', color: 'var(--text2)',
                    }}>
                      +{item.info.images.length - 6}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Download all */}
          {results.some(r => r.status === 'done' && r.info?.videoUrl && !r.resultBlob) && (
            <button
              onClick={downloadAll}
              disabled={downloadingAll}
              style={{
                width: '100%', padding: '12px', borderRadius: '12px',
                background: 'var(--success)', color: '#fff', fontWeight: 700, fontSize: '13px',
                border: 'none', cursor: downloadingAll ? 'not-allowed' : 'pointer',
                opacity: downloadingAll ? 0.5 : 1,
              }}
            >
              {downloadingAll ? '批量下载中...' : `↓ 全部下载 (${results.filter(r => r.status === 'done' && r.info?.videoUrl && !r.resultBlob).length})`}
            </button>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{
        fontSize: '10px', color: 'var(--text2)', opacity: 0.6,
        padding: '8px', textAlign: 'center',
      }}>
        本工具仅供个人学习研究使用，请勿用于商业用途。视频版权归原作者所有。
      </div>
    </div>
  )
}