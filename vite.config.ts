import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function geminiConfigPlugin(serverApiKey: string): Plugin {
  return {
    name: 'gemini-config',
    configureServer(server) {
      server.middlewares.use('/api/config', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ hasServerApiKey: Boolean(serverApiKey) }))
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/config', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ hasServerApiKey: Boolean(serverApiKey) }))
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const serverApiKey = env.GEMINI_API_KEY?.trim() ?? ''

  const geminiProxy = {
    target: 'https://generativelanguage.googleapis.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/gemini/, ''),
    configure: (proxy: { on: (event: string, handler: (...args: unknown[]) => void) => void }) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        const request = req as { headers?: { 'x-goog-api-key'?: string } }
        const proxyRequest = proxyReq as { setHeader: (name: string, value: string) => void }
        const clientKey = request.headers?.['x-goog-api-key']?.trim()
        const key = clientKey || serverApiKey
        if (key) {
          proxyRequest.setHeader('x-goog-api-key', key)
        }
      })
    },
  }

  return {
    plugins: [react(), geminiConfigPlugin(serverApiKey)],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      open: true,
      proxy: {
        '/api/gemini': geminiProxy,
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      open: true,
      proxy: {
        '/api/gemini': geminiProxy,
      },
    },
  }
})
