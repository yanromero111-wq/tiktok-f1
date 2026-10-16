// Ponte TikTok Live -> Roblox
// Lê comentários, presentes e curtidas da sua live e guarda numa fila.
// O Roblox busca essa fila a cada 1 segundo.
const express = require('express');
const { WebcastPushConnection } = require('tiktok-live-connector');

const TIKTOK_USER = process.env.TIKTOK_USER || 'seu_usuario_tiktok'; // sem @
const KEY = process.env.KEY || 'troque-essa-senha';
const PORT = process.env.PORT || 3000;

let events = [];
let nextId = 1;
let status = 'desconectado';

function push(ev) {
  ev.id = nextId++;
  ev.t = Date.now();
  events.push(ev);
  if (events.length > 500) events = events.slice(-500);
}

let conn = null;
function conectar() {
  conn = new WebcastPushConnection(TIKTOK_USER, { enableExtendedGiftInfo: true });
  conn.connect()
    .then(s => { status = 'conectado na sala ' + s.roomId; console.log(status); })
    .catch(e => {
      status = 'erro: ' + (e.message || e) + ' (a live está aberta?) tentando de novo em 30s';
      console.log(status);
      setTimeout(conectar, 30000);
    });

  conn.on('chat', d => push({ type: 'chat', user: d.uniqueId, nick: d.nickname, comment: d.comment }));

  conn.on('gift', d => {
    // presentes em sequência (streak) só contam quando terminam
    if (d.giftType === 1 && !d.repeatEnd) return;
    push({
      type: 'gift', user: d.uniqueId, nick: d.nickname,
      gift: d.giftName, count: d.repeatCount || 1,
      diamonds: (d.diamondCount || 1) * (d.repeatCount || 1)
    });
  });

  conn.on('like', d => push({ type: 'like', user: d.uniqueId, nick: d.nickname, likes: d.likeCount || 1 }));

  conn.on('disconnected', () => {
    status = 'caiu, reconectando em 15s';
    setTimeout(conectar, 15000);
  });
}
conectar();

const app = express();
app.get('/', (req, res) => res.send('Ponte F1 rodando. Status: ' + status));
app.get('/events', (req, res) => {
  if (req.query.key !== KEY) return res.status(403).json({ erro: 'senha errada' });
  const since = parseInt(req.query.since || '0', 10);
  res.json({ status, last: nextId - 1, events: events.filter(e => e.id > since) });
});
// teste sem live: /teste?key=SENHA&user=fulano&comment=Builderman
app.get('/teste', (req, res) => {
  if (req.query.key !== KEY) return res.status(403).send('senha errada');
  if (req.query.gift) push({ type: 'gift', user: req.query.user || 'teste', nick: 'teste', gift: req.query.gift, count: 1, diamonds: parseInt(req.query.diamonds || '1', 10) });
  else push({ type: 'chat', user: req.query.user || 'teste', nick: 'teste', comment: req.query.comment || 'Builderman' });
  res.send('ok, evento criado');
});
app.listen(PORT, () => console.log('porta ' + PORT));
