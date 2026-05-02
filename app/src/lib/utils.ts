// ===== Toast 提示 =====
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  const existing = document.querySelector('.toast-container')
  if (existing) existing.remove()

  const container = document.createElement('div')
  container.className = 'toast-container'
  container.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    z-index: 9999; animation: toastIn 0.3s ease;
  `

  const colors = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--accent)' }
  container.innerHTML = `
    <div style="
      background: var(--surface); border: 1px solid ${colors[type]};
      color: var(--text); padding: 12px 24px; border-radius: 10px;
      font-size: 13px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    ">${message}</div>
  `

  document.body.appendChild(container)
  setTimeout(() => container.remove(), 2500)
}

// ===== 生成文件名 =====
export function generateFilename(prefix: string, ext = 'png') {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return `${prefix}_${y}${m}${d}_${h}${min}${s}.${ext}`
}

// ===== 下载 Blob =====
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ===== 格式化文件大小 =====
export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1048576).toFixed(2) + 'MB'
}

// ===== 处理粘贴图片 =====
export async function handlePasteImage(callback: (file: File) => void) {
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type)
          const file = new File([blob], 'pasted-image.png', { type })
          callback(file)
          return
        }
      }
    }
  } catch {
    // 剪贴板权限被拒绝
  }
}
