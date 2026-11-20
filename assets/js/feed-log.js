/* ============================================================================
 * Shared persistence backend client (localStorage + SSE)
 * ==========================================================================*/

export class FeedLogClient {
  constructor(date) {
    this.date = date;
    this.entries = [];
    this.sse = null;
    this.connected = false;
  }

  async load() {
    try {
      const response = await fetch(`/api/feed-log?date=${this.date}`);
      const data = await response.json();
      this.entries = data.entries || [];
      this.saveToLocalStorage();
      return data;
    } catch (error) {
      console.error('Failed to load feed log:', error);
      return null;
    }
  }

  async save(payload) {
    try {
      const response = await fetch('/api/feed-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.ok) {
        this.entries = result.entries || [];
        this.saveToLocalStorage();
      }
      return result;
    } catch (error) {
      console.error('Failed to save feed log:', error);
      return null;
    }
  }

  connectSSE() {
    if (this.sse) return;
    
    this.sse = new EventSource(`/api/feed-log/stream?date=${this.date}`);
    
    this.sse.onopen = () => {
      this.connected = true;
      console.log('SSE connected for', this.date);
    };
    
    this.sse.onmessage = (event) => {
      if (event.data) {
        try {
          const payload = JSON.parse(event.data);
          if (payload.date === this.date) {
            this.entries = payload.entries || [];
            this.saveToLocalStorage();
            // Trigger UI update
            window.dispatchEvent(new CustomEvent('feed-log-updated', { detail: payload }));
          }
        } catch (e) {
          console.warn('SSE parse error:', e);
        }
      }
    };
    
    this.sse.onerror = (error) => {
      console.error('SSE error:', error);
      this.connected = false;
      setTimeout(() => this.connectSSE(), 3000); // Reconnect
    };
  }

  disconnectSSE() {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
      this.connected = false;
    }
  }

  saveToLocalStorage() {
    localStorage.setItem(`feed-log-${this.date}`, JSON.stringify(this.entries));
  }

  loadFromLocalStorage() {
    const stored = localStorage.getItem(`feed-log-${this.date}`);
    if (stored) {
      this.entries = JSON.parse(stored);
    }
  }
}
