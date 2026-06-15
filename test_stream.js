const http = require('http');

const req = http.request('http://localhost:3005/api/console/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, (res) => {
  let buffer = '';
  res.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim() || line.startsWith(':')) continue;
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        console.log("PARSED DATA:", data.slice(0, 100));
        try {
          const parsed = JSON.parse(data);
          console.log("SUCCESSFULLY PARSED JSON:", parsed.type);
        } catch (e) {
          console.log("FAILED TO PARSE JSON:", e.message);
        }
      }
    }
  });
  res.on('end', () => {
    console.log("END. Remaining buffer:", buffer);
  });
});

req.write(JSON.stringify({
  message: "can you guide me to deep diagnostic page?",
  history: [{"role":"user","content":"hello"},{"role":"assistant","content":"Hi"}],
  session_id: "console-session",
  organization_id: "test-org",
  user_id: "console-user"
}));
req.end();
