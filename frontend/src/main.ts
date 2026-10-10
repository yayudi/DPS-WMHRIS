// main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import FontAwesomeIcon from './plugins/fontawesome'
import vueQueryPlugin from './plugins/vueQuery'

const app = createApp(App)

// Global Error Handler
app.config.errorHandler = (err, instance, info) => {
  console.error('Global Error:', err, info)
  // Ensure we don't catch intentional aborts or normal axios errors (axios interceptor handles those)
  if (err?.name === 'AxiosError') return
}

app.use(createPinia())
app.use(router)
app.use(vueQueryPlugin)
app.component('font-awesome-icon', FontAwesomeIcon)
app.mount('#app')
