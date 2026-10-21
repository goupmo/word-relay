// Online transport. A dropped connection also drops the player from the room on the server,
// so there is nothing to resume: onClose lets the app go back to the start screen.
export function connect(onMessage, onClose) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const ws = new WebSocket(url);
  const queue = [];
  let closedByUs = false;
  ws.onopen = () => queue.splice(0).forEach((m) => ws.send(m));
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* ignore bad frame */ } };
  ws.onclose = () => { if (!closedByUs) onClose(); };
  return {
    send(msg) {
      const s = JSON.stringify(msg);
      if (ws.readyState === WebSocket.OPEN) ws.send(s); else queue.push(s);
    },
    close() { closedByUs = true; ws.close(); },
  };
}
