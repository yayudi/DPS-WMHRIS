import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig({ command: 'build' }),
  defineConfig({
    resolve: {
      alias: {
        'virtual:pwa-register/vue': fileURLToPath(new URL('./src/core/infrastructure/mocks/pwa-register.ts', import.meta.url))
      }
    },
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/*'],
      root: fileURLToPath(new URL('./', import.meta.url))
    }
  })
)
