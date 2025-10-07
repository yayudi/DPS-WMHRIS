// api/data.js
import axios from "axios"

const data = axios.create({
  baseURL: "https://office.pusatpneumatic.com",
  timeout: 10000,
})

export default data
