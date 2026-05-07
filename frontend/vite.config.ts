import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
// @ts-ignore — vitest types come from the vitest package
import type { UserConfig as VitestUserConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// HTTPS required for getUserMedia (microphone) on non-localhost origins.
// Generate certs: openssl req -x509 -newkey rsa:2048 -keyout .cert/key.pem -out .cert/cert.pem -days 365 -nodes
const certDir = path.resolve(__dirname, '.cert')
const hasCert = fs.existsSync(path.join(certDir, 'cert.pem'))

if (hasCert) {
  console.log('[vite] HTTPS enabled — using certs from', certDir)
} else {
  console.log('[vite] No certs in .cert/ — running plain HTTP (mic will only work on localhost)')
}

// https://vite.dev/config/
export default defineConfig({
  base: '/HopTopiic/',
  plugins: [react()],
  // @ts-ignore — merging vitest config
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  server: {
    host: '0.0.0.0',
    ...(hasCert && {
      https: {
        key: fs.readFileSync(path.join(certDir, 'key.pem')),
        cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
      },
    }),
  },
})
