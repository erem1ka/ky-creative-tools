import { useState, useEffect, useRef, useCallback } from 'react'

interface VideoTrimTrackProps {
  file: File
  duration: number
  trimStart: number // seconds, 0 = from beginning
  trimEnd: number   // seconds, -1 = to end
  thumbnails: string[]
  onTrimChange: (start: number, end: number) => void
}

export default function VideoTrimTrack({
  file: _file,
  duration,
  trimStart,
  trimEnd,
  thumbnails,
  onTrimChange,
}: VideoTrimTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'start' | 'end' | 'range' | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  // Effective trim values
  const effectiveStart = trimStart < 0 ? 0 : trimStart
  const effectiveEnd = trimEnd < 0 || trimEnd > duration ? duration : trimEnd

  // Convert time to position ratio (0~1)
  const startRatio = duration > 0 ? effectiveStart / duration : 0
  const endRatio = duration > 0 ? effectiveEnd / duration : 1

  // Format seconds to MM:SS or HH:MM:SS
  const formatTime = (sec: number): string => {
    if (sec < 0) sec = 0
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // Get time from mouse/touch position relative to track
  const getTimeFromEvent = useCallback((clientX: number): number => {
    if (!trackRef.current || duration <= 0) return 0
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return ratio * duration
  }, [duration])

  // Minimum selection duration
  const MIN_DURATION = 0.3

  const handleMouseDown = (type: 'start' | 'end' | 'range', e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(type)
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    if (type === 'range') {
      // Record offset from current start position
      setDragOffset(clientX)
    }
  }

  useEffect(() => {
    if (!dragging) return

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX

      if (dragging === 'start') {
        const newStart = getTimeFromEvent(clientX)
        // Don't let start exceed end minus minimum duration
        const maxStart = effectiveEnd - MIN_DURATION
        onTrimChange(Math.max(0, Math.min(maxStart, newStart)), effectiveEnd)
      } else if (dragging === 'end') {
        const newEnd = getTimeFromEvent(clientX)
        // Don't let end go below start plus minimum duration
        const minEnd = effectiveStart + MIN_DURATION
        onTrimChange(effectiveStart, Math.max(minEnd, Math.min(duration, newEnd)))
      } else if (dragging === 'range') {
        // Move entire selection range
        const deltaPx = clientX - dragOffset
        if (!trackRef.current) return
        const trackWidth = trackRef.current.getBoundingClientRect().width
        const deltaTime = (deltaPx / trackWidth) * duration
        const rangeDuration = effectiveEnd - effectiveStart
        let newStart = effectiveStart + deltaTime
        let newEnd = newStart + rangeDuration

        // Clamp to boundaries
        if (newStart < 0) { newStart = 0; newEnd = rangeDuration }
        if (newEnd > duration) { newEnd = duration; newStart = duration - rangeDuration }

        onTrimChange(newStart, newEnd)
        setDragOffset(clientX) // Update offset for next delta calculation
      }
    }

    const handleUp = () => {
      setDragging(null)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleMove)
    window.addEventListener('touchend', handleUp)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
    }
  }, [dragging, dragOffset, effectiveStart, effectiveEnd, duration, getTimeFromEvent, onTrimChange])

  if (duration <= 0 || thumbnails.length === 0) {
    return (
      <div style={{
        padding: '12px', borderRadius: '8px', background: 'var(--surface2)',
        color: 'var(--text2)', fontSize: '11px', textAlign: 'center',
      }}>
        加载视频信息中...
      </div>
    )
  }

  const selectionDuration = effectiveEnd - effectiveStart

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Time info */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: '11px', color: 'var(--text2)',
      }}>
        <span>{formatTime(effectiveStart)}</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>
          选取 {formatTime(selectionDuration)}
        </span>
        <span>{formatTime(effectiveEnd)}</span>
      </div>

      {/* Track */}
      <div ref={trackRef} style={{
        position: 'relative', height: '44px', borderRadius: '6px',
        background: '#111', overflow: 'hidden', cursor: 'default',
        userSelect: 'none', touchAction: 'none',
      }}>
        {/* Thumbnail strip */}
        <div style={{
          display: 'flex', height: '100%', width: '100%',
        }}>
          {thumbnails.map((url, i) => (
            <div key={i} style={{
              flex: '1 1 0', height: '100%', overflow: 'hidden',
              borderRight: i < thumbnails.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <img
                src={url}
                alt=""
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  display: 'block', pointerEvents: 'none',
                }}
                draggable={false}
              />
            </div>
          ))}
        </div>

        {/* Left mask (before selection) */}
        <div style={{
          position: 'absolute', left: 0, top: 0,
          width: `${startRatio * 100}%`, height: '100%',
          background: 'rgba(0,0,0,0.65)',
          pointerEvents: 'none',
        }} />

        {/* Right mask (after selection) */}
        <div style={{
          position: 'absolute', right: 0, top: 0,
          width: `${(1 - endRatio) * 100}%`, height: '100%',
          background: 'rgba(0,0,0,0.65)',
          pointerEvents: 'none',
        }} />

        {/* Selection highlight */}
        <div
          onMouseDown={(e) => handleMouseDown('range', e)}
          onTouchStart={(e) => handleMouseDown('range', e)}
          style={{
            position: 'absolute',
            left: `${startRatio * 100}%`,
            top: 0,
            width: `${(endRatio - startRatio) * 100}%`,
            height: '100%',
            border: '2px solid var(--accent)',
            borderRadius: '3px',
            cursor: dragging === 'range' ? 'grabbing' : 'grab',
            boxSizing: 'border-box',
          }}
        />

        {/* Start handle */}
        <div
          onMouseDown={(e) => handleMouseDown('start', e)}
          onTouchStart={(e) => handleMouseDown('start', e)}
          style={{
            position: 'absolute',
            left: `${startRatio * 100}%`,
            top: 0, height: '100%',
            width: '10px',
            marginLeft: '-5px',
            cursor: 'ew-resize',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            zIndex: 10,
          }}
        >
          {/* Handle bar */}
          <div style={{
            width: '4px', height: '20px', borderRadius: '2px',
            background: 'var(--accent)',
            margin: '0 auto',
            boxShadow: '0 0 4px rgba(255,76,139,0.5)',
          }} />
        </div>

        {/* End handle */}
        <div
          onMouseDown={(e) => handleMouseDown('end', e)}
          onTouchStart={(e) => handleMouseDown('end', e)}
          style={{
            position: 'absolute',
            left: `${endRatio * 100}%`,
            top: 0, height: '100%',
            width: '10px',
            marginLeft: '-5px',
            cursor: 'ew-resize',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <div style={{
            width: '4px', height: '20px', borderRadius: '2px',
            background: 'var(--accent)',
            margin: '0 auto',
            boxShadow: '0 0 4px rgba(255,76,139,0.5)',
          }} />
        </div>

        {/* Total duration label at bottom center */}
        <div style={{
          position: 'absolute', bottom: '2px', left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '9px', color: 'rgba(255,255,255,0.4)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          总时长 {formatTime(duration)}
        </div>
      </div>

      {/* Reset button */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={() => onTrimChange(0, duration)}
          style={{
            padding: '3px 10px', borderRadius: '4px', fontSize: '10px',
            background: 'var(--surface2)', color: 'var(--text2)',
            border: 'none', cursor: 'pointer',
            opacity: effectiveStart === 0 && effectiveEnd === duration ? 0.4 : 1,
          }}
          disabled={effectiveStart === 0 && effectiveEnd === duration}
        >
          重置选取
        </button>
      </div>
    </div>
  )
}