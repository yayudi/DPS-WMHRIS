import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

const publicDir = path.resolve(fileURLToPath(new URL('./public', import.meta.url)))
const VIRTUAL_PUBLIC_ASSET_PREFIX = '\0public-asset:'

export default mergeConfig(
  viteConfig({ command: 'build', mode: 'test' }),
  defineConfig({
    plugins: [
      {
        name: 'vitest-public-asset-resolver',
        enforce: 'pre',
        resolveId(source) {
          if (!source.startsWith('/') || source.startsWith('//')) return null

          const [cleanPath] = source.split('?')
          const resolved = path.resolve(publicDir, cleanPath.slice(1))
          if (!resolved.startsWith(`${publicDir}${path.sep}`)) return null
          if (!existsSync(resolved) || !statSync(resolved).isFile()) return null

          return `${VIRTUAL_PUBLIC_ASSET_PREFIX}${source}`
        },
        load(id) {
          if (!id.startsWith(VIRTUAL_PUBLIC_ASSET_PREFIX)) return null
          const publicPath = id.slice(VIRTUAL_PUBLIC_ASSET_PREFIX.length)
          return `export default ${JSON.stringify(publicPath)}`
        }
      }
    ],
    resolve: {
      alias: {
        'virtual:pwa-register/vue': fileURLToPath(new URL('./src/core/infrastructure/mocks/pwa-register.ts', import.meta.url))
      }
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/core/infrastructure/mocks/vitest.setup.ts'],
      exclude: [...configDefaults.exclude, 'e2e/*'],
      root: fileURLToPath(new URL('./', import.meta.url))
    }
  })
)
