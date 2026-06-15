const https = require('https');

const req = https.request('https://api.aivory.id/console/stream', {
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
      }
    }
  });
});

req.write(JSON.stringify({
  message: "can you guide me to deep diagnostic page",
  history: [
    {"role":"user","content":"hello"},
    {"role":"assistant","content":"Hi, good to see you here. To help effectively, where are you right now?\n\n1. You already have a Diagnostic result and an AI System Blueprint.\n2. You have a Diagnostic result but no Blueprint yet.\n3. You are starting from scratch and want guidance from the beginning.\n\nJust reply with 1, 2, or 3."}
  ],
  mode: "console",
  channel: "console_ui",
  entrypoint: "console",
  context: {
    session_id: "console-session",
    organization_id: "test-org",
    user_id: "console-user",
    page: "console",
    source_tab: "console"
  }
}));
req.end();
