import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// 自定义插件：阻止 Vite 将 WASM 文件作为 asset 打包（我们用 public/ 目录手动提供）
function excludeWasmAssets(): Plugin {
  return {
    name: 'exclude-wasm-assets',
    generateBundle(options, bundle) {
      // 移除所有 WASM 文件（它们会从 public/ 目录提供）
      for (const name of Object.keys(bundle)) {
        if (name.endsWith('.wasm')) {
          delete bundle[name]
        }
      }
    },
  }
}

// 自定义插件：代理 GPT-Image-2 生图 API（API Key 仅在服务端使用）
function imageProxyPlugin(): Plugin {
  return {
    name: 'image-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/generate-image' || req.method !== 'POST') {
          return next()
        }

        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: '服务端未配置 OPENAI_API_KEY，请检查 .env.local' }))
          return
        }

        const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
        const model = process.env.OPENAI_MODEL || 'gpt-image-2'

        // 读取请求体
        let body = ''
        for await (const chunk of req) { body += chunk }
        let params: Record<string, unknown>
        try {
          params = JSON.parse(body)
        } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ error: '请求体 JSON 解析失败' }))
          return
        }

        // 服务端注入 model，前端无需传递
        params.model = model

        try {
          const upstream = await fetch(`${baseUrl}/images/generations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
          })

          const contentType = upstream.headers.get('content-type') || 'application/json'
          res.setHeader('Content-Type', contentType)
          res.statusCode = upstream.status

          if (contentType.includes('application/json')) {
            const data = await upstream.json()
            res.end(JSON.stringify(data))
          } else {
            const buffer = await upstream.arrayBuffer()
            res.end(Buffer.from(buffer))
          }
        } catch (err: unknown) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: `代理请求失败: ${err instanceof Error ? err.message : String(err)}` }))
        }
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), excludeWasmAssets(), imageProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('onnxruntime-web')) {
            return 'ort-vendor'
          }
        },
      },
    },
  },
})