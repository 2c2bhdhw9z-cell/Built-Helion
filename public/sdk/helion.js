/**
 * Helion JS helper — REST only. Live physics still runs in a browser.
 * Usage: import { Helion } from "/sdk/helion.js"
 */
export class Helion {
  constructor(origin, token) {
    this.origin = String(origin || "").replace(/\/$/, "");
    this.token = token || "";
  }

  async get(path) {
    const headers = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`${this.origin}${path}`, { headers });
    if (!res.ok) throw new Error(`Helion ${res.status}`);
    return res.json();
  }

  async post(path, body) {
    const headers = { "content-type": "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`${this.origin}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) throw new Error(`Helion ${res.status}`);
    return res.json();
  }

  meta() {
    return this.get("/api/v1/meta");
  }
  library() {
    return this.get("/api/v1/library");
  }
  creations() {
    return this.get("/api/v1/creations");
  }
  save(name, config) {
    return this.post("/api/v1/creations", { name, config });
  }
  /** Queue a command for a listening lab (Bearer). Not a WebSocket. */
  control(payload) {
    return this.post("/api/v1/control", payload);
  }
}
