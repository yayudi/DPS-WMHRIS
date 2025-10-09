// api/axios.js
import axios from 'axios'
import { API_URL } from './config'

const instance = axios.create({
  baseURL: API_URL, // Ini akan menjadi 'http://localhost:3000/'
})

/**
 * Interceptor (penjaga) untuk menambahkan token otentikasi
 * secara otomatis ke setiap request yang dikirim.
 */
instance.interceptors.request.use(
  (config) => {
    // Ambil token dari localStorage atau Pinia store
    const token = localStorage.getItem('authToken') // Sesuaikan dengan cara Anda menyimpan token
    if (token) {
      // Jika token ada, tambahkan ke header Authorization
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    // Lakukan sesuatu dengan error request
    return Promise.reject(error)
  },
)

export default instance
