// api/axios.js
import axios from 'axios'

// Baca base URL dari environment variable Vite
const baseURL = import.meta.env.VITE_API_BASE_URL

// Buat instance Axios dengan baseURL yang dinamis
const api = axios.create({
  baseURL: baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

//  Interceptor untuk mengirim token secara otomatis di setiap request setelah login.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken')
    if (token) {
      // Header standar untuk mengirim JWT adalah 'Authorization: Bearer <token>'
      config.headers.Authorization = `Bearer ${token}`
    }
    console.log('Mengirim request ke:', config.baseURL + config.url)
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

export default api
