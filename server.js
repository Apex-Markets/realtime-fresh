const express = require('express');
const WebSocket = require('ws');
const { Pool } = require('pg');
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// DB pool (Render's DATABASE_URL env var)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Track connected sockets per conversation
const chatRooms = {}; // { conversation_id: Set(ws) }

wss.on('connection', function connection(ws) {
  let conversation_id = null;

  ws.on('message', async function incoming(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.join) {
      conversation_id = msg.join;
      chatRooms[conversation_id] = chatRooms[conversation_id] || new Set();
      chatRooms[conversation_id].add(ws);
    }
    if (msg.message && msg.sender_id && conversation_id) {
      // Save to database
     await pool.query(
  'INSERT INTO group_messages (group_id, user_id, body, created_at) VALUES ($1, $2, $3, NOW())',
  [conversation_id, msg.sender_id, msg.message]
);
      // Send to all in room
      chatRooms[conversation_id].forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            conversation_id,
            sender_id: msg.sender_id,
            body: msg.message,
            created_at: new Date().toISOString()
          }));
        }
      });
    }
  });

  ws.on('close', () => {
    if (conversation_id && chatRooms[conversation_id]) {
      chatRooms[conversation_id].delete(ws);
    }
  });
});

server.listen(process.env.PORT || 8080, () => console.log('Listening on *:', process.env.PORT || 8080));