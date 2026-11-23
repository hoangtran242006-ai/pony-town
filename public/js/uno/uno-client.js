class UnoClient {
  constructor() {
    this.ws = null;
    this.connected = false;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws`);
    this.ws.onopen = () => {
      this.connected = true;
      this.send({ type: 'uno_tables' });
    };
    this.ws.onmessage = event => {
      if (typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data);
        window.dispatchEvent(new CustomEvent('uno-message', { detail: msg }));
      } catch (_) {}
    };
    this.ws.onclose = () => {
      this.connected = false;
      setTimeout(() => this.connect(), 2000);
    };
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  }
}
