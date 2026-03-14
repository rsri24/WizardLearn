/**
 * WizardLearn API Client
 * All frontend <-> backend communication goes through here
 */

const API = {
  base: '/api',

  // ── Auth token storage ──────────────────────────────────────────────────
  getToken() { return localStorage.getItem('wl_token'); },
  setToken(t) { localStorage.setItem('wl_token', t); },
  clearToken() { localStorage.removeItem('wl_token'); localStorage.removeItem('wl_user'); },

  getUser() {
    try { return JSON.parse(localStorage.getItem('wl_user') || 'null'); }
    catch { return null; }
  },
  setUser(u) { localStorage.setItem('wl_user', JSON.stringify(u)); },

  // ── Core fetch wrapper ──────────────────────────────────────────────────
  async request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(this.base + path, opts);
      const data = await res.json();

      if (res.status === 401) {
        this.clearToken();
        window.location.hash = '#login';
      }

      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.error('API error:', err);
      return { ok: false, data: { success: false, message: 'Network error. Please check your connection.' } };
    }
  },

  get(path)         { return this.request('GET', path); },
  post(path, body)  { return this.request('POST', path, body); },
  patch(path, body) { return this.request('PATCH', path, body); },

  // ── Auth ────────────────────────────────────────────────────────────────
  async signup(payload) {
    return this.post('/auth/signup', payload);
  },
  async requestOtp(email) {
    return this.post('/auth/request-otp', { email });
  },
  async verifyOtp(email, otp) {
    const res = await this.post('/auth/verify-otp', { email, otp });
    if (res.ok && res.data.token) {
      this.setToken(res.data.token);
      this.setUser(res.data.user);
    }
    return res;
  },
  async getMe() {
    const res = await this.get('/auth/me');
    if (res.ok) this.setUser(res.data.user);
    return res;
  },
  async updateProfile(updates) {
    const res = await this.patch('/auth/profile', updates);
    if (res.ok) this.setUser(res.data.user);
    return res;
  },
  logout() { this.clearToken(); },

  // ── Questions ───────────────────────────────────────────────────────────
  async getQuestions({ subject, level, count = 5, examType = 'general', topic } = {}) {
    const params = new URLSearchParams({ subject });
    if (level) params.set('level', level);
    if (count) params.set('count', count);
    if (examType) params.set('examType', examType);
    if (topic) params.set('topic', topic);
    return this.get(`/questions?${params}`);
  },
  async getHint(questionId) {
    return this.get(`/questions/${questionId}/hint`);
  },
  async submitAnswer(questionId, payload) {
    return this.post(`/questions/${questionId}/answer`, payload);
  },
  async generateQuestion(subject, level, topic, examType) {
    return this.post('/questions/generate', { subject, level, topic, examType });
  },

  // ── Progress ────────────────────────────────────────────────────────────
  async getMyProgress() {
    return this.get('/progress/me');
  },
  async getLeaderboard(scope = 'class', subject, period = 'week') {
    const params = new URLSearchParams({ scope, period });
    if (subject) params.set('subject', subject);
    return this.get(`/progress/leaderboard?${params}`);
  },
  async getChildProgress(childId) {
    return this.get(`/progress/child/${childId}`);
  },
};

// ── Toast notification helper ─────────────────────────────────────────────
function toast(message, type = 'info', duration = 3000) {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:${type==='error'?'#ef4444':type==='success'?'#10b981':'#6c3aed'};
    color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;
    z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,.3);
    animation:toastIn .3s ease;font-family:'Nunito',sans-serif;max-width:300px;text-align:center;
  `;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
