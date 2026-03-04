#!/bin/bash
PORT=8081
HEX_PORT=$(printf '%04X' $PORT)

echo "Checking for processes on port $PORT..."

PIDS=$(node -e "
const fs = require('fs');
const hex = '$HEX_PORT';
const pids = new Set();
for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
  try {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    for (const line of lines) {
      if (line.includes(':' + hex + ' ') && line.includes(' 0A ')) {
        const parts = line.trim().split(/\s+/);
        const inode = parts[9];
        const dirs = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d));
        for (const pid of dirs) {
          try {
            const fds = fs.readdirSync('/proc/' + pid + '/fd');
            for (const fd of fds) {
              try {
                const link = fs.readlinkSync('/proc/' + pid + '/fd/' + fd);
                if (link.includes('socket:[' + inode + ']')) {
                  pids.add(pid);
                }
              } catch {}
            }
          } catch {}
        }
      }
    }
  } catch {}
}
console.log([...pids].join(' '));
" 2>/dev/null)

if [ -n "$PIDS" ]; then
  echo "Killing PIDs on port $PORT: $PIDS"
  for PID in $PIDS; do
    kill -9 $PID 2>/dev/null
  done
  sleep 2
else
  echo "Port $PORT is free"
fi

pkill -9 -f "expo start.*--port $PORT" 2>/dev/null
sleep 1

echo "Starting Metro on port $PORT..."
exec npx expo start --localhost --port $PORT
