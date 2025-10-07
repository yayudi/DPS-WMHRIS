// api/mock.js
import MockAdapter from 'axios-mock-adapter'
import api from './axios'
import { JSON_URL } from './config'

const mock = new MockAdapter(api, { delayResponse: 500 })

// Cache user dari JSON hosting
let USERS = []

// Ambil daftar user dari hosting
async function loadUsers() {
  try {
    const res = await fetch(JSON_URL + 'dev_users.json')
    USERS = await res.json()
    // console.log("✅ Loaded mock users:", USERS);
  } catch (err) {
    console.error('❌ Gagal load dev_users.json:', err)
    USERS = []
  }
}

// Panggil sekali saat init
loadUsers()

// ✅ Mock login
mock.onPost('/auth/login').reply((config) => {
  const { username, password } = JSON.parse(config.data)

  const user = USERS.find((u) => u.username === username && u.password === password)
  if (user) {
    const fakeToken = 'mock-jwt-token'
    localStorage.setItem('token', fakeToken)
    return [200, { success: true, token: fakeToken, message: 'Login berhasil', user }]
  }

  return [401, { success: false, message: 'Username atau password salah' }]
})

// ✅ Mock session
mock.onGet('/auth/session').reply(() => {
  const loggedIn = !!localStorage.getItem('token')
  return [200, { loggedIn }]
})

// ✅ Mock logout
mock.onPost('/auth/logout').reply(() => {
  localStorage.removeItem('token')
  return [200, { success: true }]
})

export default mock
