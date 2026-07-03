import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function loadEnvKey() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) {
    console.error('❌ .env ファイルが見つかりません')
    console.error('   .env.example をコピーして GEMINI_API_KEY=... を設定してください')
    process.exit(1)
  }
  const content = readFileSync(envPath, 'utf-8')
  const match = content.match(/^GEMINI_API_KEY=(.+)$/m)
  const key = match?.[1]?.trim().replace(/^["']|["']$/g, '')
  if (!key) {
    console.error('❌ .env に GEMINI_API_KEY が設定されていません')
    process.exit(1)
  }
  return key
}

const apiKey = process.argv[2]?.trim() || loadEnvKey()
const masked = `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`

console.log(`Gemini APIキーを確認中: ${masked}`)

const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
  headers: { 'x-goog-api-key': apiKey },
})

if (response.ok) {
  console.log('✅ Gemini APIキーは有効です')
  process.exit(0)
}

const body = await response.text()
console.error(`❌ エラー (${response.status})`)
try {
  const data = JSON.parse(body)
  console.error('   ', data.error?.message || body)
} catch {
  console.error('   ', body)
}

if (response.status === 401 || response.status === 403) {
  console.error('\n対処法:')
  console.error('  1. https://aistudio.google.com/apikey で新しいキーを作成')
  console.error('  2. .env の GEMINI_API_KEY を更新して npm run dev を再起動')
}

process.exit(1)
