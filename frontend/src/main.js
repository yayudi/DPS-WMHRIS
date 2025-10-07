// main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import FontAwesomeIcon from './plugins/fontawesome.js'

// aktifkan mock hanya kalau pakai env mock
if (import.meta.env.VITE_USE_MOCK === 'true') {
  await import('./api/mock')
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.component('font-awesome-icon', FontAwesomeIcon)
app.mount('#app')
