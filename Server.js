const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const file = path.join(__dirname, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Ошибка чтения index.html');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

const users = new Map();

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcast(obj, except = null) {
  for (const ws of users.keys()) {
    if (ws !== except) send(ws, obj);
  }
}

function broadcastUserList() {
  const list = [...users.values()].map(u => ({ name: u.name, color: u.color }));
  broadcast({ type: 'users', users: list });
}

function findSocketByName(name) {
  for (const [ws, u] of users) {
    if (u.name === name) return ws;
  }
  return null;
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    
    if (msg.type === 'join') {
      const name = String(msg.name || '').trim().slice(0, 20);
      const color = /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : '#333333';

      if (!name) {
        return send(ws, { type: 'join_error', text: 'Введите имя.' });
      }
      if (users.has(ws)) return; 
      if (findSocketByName(name)) {
        return send(ws, { type: 'join_error', text: 'Имя «' + name + '» уже занято.' });
      }

      const others = [...users.values()].map(u => u.name);
      users.set(ws, { name, color });

      send(ws, { type: 'joined', name });

      
      if (others.length === 0) {
        send(ws, { type: 'system', text: 'Добро пожаловать. Вы первый в чате.' });
      } else {
        send(ws, {
          type: 'system',
          text: 'Добро пожаловать. В чате уже присутствуют: ' + others.join(', ') + '.'
        });
      }

      broadcast({ type: 'system', text: 'К нам присоединился ' + name + '.' }, ws);
      broadcastUserList();
      return;
    }

    if (msg.type === 'message') {
      const user = users.get(ws);
      if (!user) return;

      const text = String(msg.text || '').trim().slice(0, 1000);
      if (!text) return;

      const payload = { type: 'message', name: user.name, color: user.color, text };

      if (msg.to) {
        const target = findSocketByName(msg.to);
        if (!target) {
          return send(ws, { type: 'system', text: 'Пользователь «' + msg.to + '» не найден.' });
        }
        payload.private = true;
        payload.to = msg.to;
        send(target, payload);
        if (target !== ws) send(ws, payload);
      } else {
        broadcast(payload);
      }
    }
  });

  ws.on('close', () => {
    const user = users.get(ws);
    if (!user) return;
    users.delete(ws);
    broadcast({ type: 'system', text: user.name + ' нас покинул.' });
    broadcastUserList();
  });
});

server.listen(PORT, () => {
  console.log('Чат запущен: http://localhost:' + PORT);
});