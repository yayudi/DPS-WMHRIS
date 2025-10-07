// api/auth.js
import api from "./axios";

export async function login(username, password) {
  try {
    const { data } = await api.post("/auth/login", { username, password });
    if (data?.token) {
      localStorage.setItem("token", data.token);
    }
    return data;
  } catch (err) {
    console.error("Login error:", err.response?.data || err.message);
    throw err;
  }
}

export async function getSession() {
  try {
    const { data } = await api.get("/auth/session");
    return data;
  } catch (err) {
    console.error("Session error:", err.response?.data || err.message);
    return { loggedIn: false };
  }
}

export async function logout() {
  try {
    await api.post("/auth/logout");
    localStorage.removeItem("token");
    return true;
  } catch (err) {
    console.error("Logout error:", err.response?.data || err.message);
    return false;
  }
}
