// frontend/src/plugins/vueQuery.js
import { VueQueryPlugin } from '@tanstack/vue-query'

export default {
  install(app) {
    app.use(VueQueryPlugin, {
      queryClientConfig: {
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 2,
            staleTime: 5 * 60 * 1000 // Data is fresh for 5 mins by default
          }
        }
      }
    })
  }
}
