/**
 * Helion JS helper — REST only. Live physics still runs in a Helion lab
 * (browser, PWA, or a later native webview). Empty lists are empty.
 *
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

  async send(path, method, body) {
    const headers = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${this.origin}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Helion ${res.status}`);
    if (res.status === 204) return null;
    return res.json();
  }

  post(path, body) {
    return this.send(path, "POST", body ?? {});
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
  creation(id) {
    return this.get(`/api/v1/creations/${encodeURIComponent(id)}`);
  }
  save(name, config) {
    return this.post("/api/v1/creations", { name, config });
  }
  deleteCreation(id) {
    return this.send(`/api/v1/creations/${encodeURIComponent(id)}`, "DELETE");
  }
  history() {
    return this.get("/api/v1/history");
  }
  teams() {
    return this.get("/api/v1/teams");
  }
  usage() {
    return this.get("/api/v1/usage");
  }
  deliveries() {
    return this.get("/api/v1/webhooks/deliveries");
  }
  /** Queue a command for a listening lab (Bearer). Not a WebSocket. */
  control(payload) {
    return this.post("/api/v1/control", payload);
  }
  pollControl() {
    return this.get("/api/v1/control");
  }
}
