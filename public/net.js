// Online transport. A connection that drops after it was open also drops the player from the room on the
// server, so there is nothing to resume: onClose lets the app tell the player.
// Before it was ever open (a sleeping free-tier server can take a while to wake) the connection is retried;
// onStatus reports 'connecting' | 'retry' (with the attempt number) | 'open' | 'failed'.
const MAX_TRIES = 4;

export function connect(onMessage, onClose, onStatus = () => {}) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const queue = [];
  let ws = null;
  let closedByUs = false;
  let opened = false;
  let tries = 0;
  let retryTimer = null;

  function open() {
    onStatus(tries ? 'retry' : 'connecting', tries);
    ws = new WebSocket(url);
    ws.onopen = () => { opened = true; onStatus('open'); queue.splice(0).forEach((m) => ws.send(m)); };
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* ignore bad frame */ } };
    ws.onclose = () => {
      if (closedByUs) return;
      if (opened) return onClose();
      if (tries >= MAX_TRIES) return onStatus('failed');
      tries++;
      retryTimer = setTimeout(() => { if (!closedByUs) open(); }, 1200 * tries);
    };
  }
  open();

  return {
    send(msg) {
      const s = JSON.stringify(msg);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(s); else queue.push(s);
    },
    close() { closedByUs = true; clearTimeout(retryTimer); ws?.close(); },
  };
}
