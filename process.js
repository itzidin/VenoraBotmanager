const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcrypt');

// --------------------------
// CONFIG - EDIT AS NEEDED
// --------------------------

// Port for the Express web server
const PORT = 8080;

// User credentials (username -> hashed password)
const USERS = {
  admin: '$2b$10$Rt5RwDyBx9tJd4JGEQYHtuN4J2aLlhrmNRn5RiZ.MtabW6juUO5Em' // password: admin123
};

// Session secret for cookies
const SESSION_SECRET = 'your-secret-key-here';

// Bot configuration with dynamic loading support
const CONFIG_DIR = path.join(__dirname, "config");
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

const BOT_CONFIG_FILE = path.join(CONFIG_DIR, "bots.json");
let BOTS = {
  // Example bots with cross-platform paths
  example_py: {
    script: "./test_bots/example.py",
    cmd: "python3",
    type: "script",
    name: "Example Python Bot",
    description: "Example bot using relative path"
  },
  example_js: {
    script: "./test_bots/example.js",
    cmd: "node",
    type: "script",
    name: "Example Node.js Bot",
    description: "Example bot using relative path"
  }
};

// Load bot configuration from file if it exists
function loadBotConfig() {
  try {
    if (fs.existsSync(BOT_CONFIG_FILE)) {
      const configData = fs.readFileSync(BOT_CONFIG_FILE, 'utf8');
      BOTS = JSON.parse(configData);
    } else {
      // Save initial configuration
      saveBotConfig();
    }
  } catch (error) {
    console.error('Error loading bot configuration:', error);
  }
}

// Save current bot configuration to file
function saveBotConfig() {
  try {
    fs.writeFileSync(BOT_CONFIG_FILE, JSON.stringify(BOTS, null, 2));
  } catch (error) {
    console.error('Error saving bot configuration:', error);
  }
}

// Initialize configuration
loadBotConfig();

// Directory to store logs
const LOG_DIR = path.join(__dirname, "logs");

// If true, automatically start all bots on server boot
const AUTO_START = true;


// --------------------------
// INTERNALS
// --------------------------
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// We'll keep track of child processes in a dictionary
// { botKey: { proc: ChildProcess, logFile: WriteStream } }
const processMap = {};

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware setup
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create static middleware once
const staticMiddleware = express.static('public');

// Serve static files only for authenticated users
app.use((req, res, next) => {
  if (req.session && req.session.user) {
    return staticMiddleware(req, res, next);
  } else if (req.path === '/login') {
    return next();
  } else {
    return res.redirect('/login');
  }
});

// Authentication middleware
function authRequired(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
}

// Socket.io connection handling
io.on('connection', (socket) => {
  socket.on('joinBot', (botKey) => {
    socket.join(botKey);
  });
});

// --------------------------
// ROUTES
// --------------------------

// API Routes
// Add new bot
app.post('/api/bots', authRequired, (req, res) => {
    const { id, script, cmd, name, description } = req.body;
    
    if (!id || !script || !cmd) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    if (BOTS[id]) {
        return res.status(409).json({ error: "Bot ID already exists" });
    }

    BOTS[id] = {
        script,
        cmd,
        name: name || id,
        description: description || ''
    };

    saveBotConfig();
    res.json({ success: true, bot: BOTS[id] });
});

// Delete bot
app.delete('/api/bots/:botKey', authRequired, (req, res) => {
    const botKey = req.params.botKey;
    
    if (!BOTS[botKey]) {
        return res.status(404).json({ error: "Bot not found" });
    }

    // Stop bot if running
    if (processMap[botKey]) {
        const { proc, logFile } = processMap[botKey];
        proc.kill();
        logFile.end();
        delete processMap[botKey];
    }

    delete BOTS[botKey];
    saveBotConfig();
    res.json({ success: true });
});

// Get bot list with status
app.get('/api/bots', authRequired, (req, res) => {
    const botStatus = {};
    Object.keys(BOTS).forEach(key => {
        botStatus[key] = {
            ...BOTS[key],
            running: !!processMap[key]
        };
    });
    res.json(botStatus);
});

app.get('/api/logs/:botKey', authRequired, (req, res) => {
    const botKey = req.params.botKey;
    if (!BOTS[botKey]) {
        return res.status(404).json({ error: "Bot not found" });
    }

    const logFilePath = path.join(LOG_DIR, `${botKey}.log`);
    if (!fs.existsSync(logFilePath)) {
        return res.json({ logs: "" });
    }

    const content = fs.readFileSync(logFilePath, "utf-8");
    res.send(content);
});

// Login routes
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Login - Bot Manager</title>
      <style>
        body { background: #222; color: #eee; font-family: sans-serif; padding: 20px; }
        form { max-width: 300px; margin: 0 auto; }
        input { width: 100%; padding: 8px; margin: 8px 0; }
        button { width: 100%; padding: 10px; background: #0af; color: white; border: none; }
        .error { color: red; margin: 10px 0; }
      </style>
    </head>
    <body>
      <form action="/login" method="post">
        <h1>Bot Manager Login</h1>
        ${req.query.error ? '<div class="error">Invalid credentials</div>' : ''}
        <input type="text" name="username" placeholder="Username" required>
        <input type="password" name="password" placeholder="Password" required>
        <button type="submit">Log in</button>
      </form>
    </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (USERS[username]) {
    bcrypt.compare(password, USERS[username], (err, result) => {
      if (result) {
        req.session.user = username;
        res.redirect('/');
      } else {
        res.redirect('/login?error=1');
      }
    });
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Protected routes
app.get('/', authRequired, (req, res) => {
  // Basic HTML listing each bot, showing start/stop/logs
  const rows = Object.keys(BOTS).map(botKey => {
    const isRunning = !!processMap[botKey];
    return `
      <tr>
        <td>${botKey}</td>
        <td>${isRunning ? '<span style="color:lime">Running</span>' : '<span style="color:red">Stopped</span>'}</td>
        <td>
          ${isRunning
            ? `<a href="/stop/${botKey}"><button>Stop</button></a>`
            : `<a href="/start/${botKey}"><button>Start</button></a>`}
        </td>
        <td>
          <a href="/logs/${botKey}" target="_blank"><button>View Logs</button></a>
        </td>
      </tr>
    `;
  });

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Simple Bot Manager</title>
    <style>
      body { background: #222; color: #eee; font-family: sans-serif; padding: 20px; }
      table { border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #555; padding: 8px 12px; }
      a { color: #0af; text-decoration: none; }
      button { padding: 6px 10px; }
    </style>
  </head>
  <body>
    <h1>Simple Bot Manager</h1>
    <div style="text-align: right; margin-bottom: 20px;">
      <span style="color: #0af;">Logged in as ${req.session.user}</span>
      <a href="/logout" style="margin-left: 10px;"><button>Logout</button></a>
    </div>
    <table>
      <tr>
        <th>Bot</th>
        <th>Status</th>
        <th>Action</th>
        <th>Logs</th>
      </tr>
      ${rows.join('')}
    </table>
  </body>
  </html>
  `;

  res.send(html);
});

app.get('/start/:botKey', authRequired, (req, res) => {
  const botKey = req.params.botKey;
  if (!BOTS[botKey]) {
    return res.status(404).send("Bot not found.");
  }
  if (processMap[botKey]) {
    return res.send(`Bot "${botKey}" is already running.`);
  }

  const { cmd, script, type = 'script', workDir } = BOTS[botKey];
  const logFilePath = path.join(LOG_DIR, `${botKey}.log`);
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  // Normalize and resolve paths
  function normalizePath(inputPath) {
    if (!inputPath) return '';
    
    // Convert Windows backslashes to forward slashes
    const normalized = inputPath.replace(/\\/g, '/');
    
    // Check if it's a Windows absolute path (e.g., C:/Users/...)
    const isWindowsAbsolute = /^[A-Za-z]:/i.test(normalized);
    
    if (isWindowsAbsolute) {
      // For Windows absolute paths, just normalize slashes
      return normalized;
    } else if (path.isAbsolute(normalized)) {
      // For Unix absolute paths
      return normalized;
    } else {
      // For relative paths
      return path.join(__dirname, normalized);
    }
  }

  // Handle script path
  const scriptPath = script ? normalizePath(script) : '';
  
  // Determine working directory
  let workingDir;
  if (workDir) {
    workingDir = normalizePath(workDir);
  } else if (script) {
    workingDir = path.dirname(scriptPath);
  } else {
    workingDir = __dirname;
  }

  // Parse command and arguments
  let command, args;
  if (type === 'npm') {
    command = 'npm';
    args = ['run', cmd];
  } else if (type === 'custom') {
    const parts = cmd.split(' ');
    command = parts[0];
    args = parts.slice(1);
    if (script) {
      args.push(scriptPath);
    }
  } else {
    command = cmd;
    args = script ? [scriptPath] : [];
  }

  // Spawn the process
  console.log(`[${botKey}] Spawning process:`, { command, args, workingDir, type });
  const child = spawn(command, args, {
    cwd: workingDir,
    detached: false,
    shell: type === 'custom' // Enable shell for custom commands
  });
  
  console.log(`[${botKey}] Process spawned with PID:`, child.pid);

  // Pipe output to log
  child.stdout.on('data', data => {
    console.log(`[${botKey}] stdout:`, data.toString());
    logStream.write(data);
    io.to(botKey).emit('output', { type: 'stdout', data: data.toString(), botKey });
  });
  child.stderr.on('data', data => {
    console.log(`[${botKey}] stderr:`, data.toString());
    logStream.write(data);
    io.to(botKey).emit('output', { type: 'stderr', data: data.toString(), botKey });
  });

  child.on('close', code => {
    logStream.write(`\nProcess exited with code ${code}\n`);
    logStream.end();
    delete processMap[botKey];
    io.to(botKey).emit('status', { status: 'stopped', code, botKey });
  });

  // Store reference
  processMap[botKey] = {
    proc: child,
    logFile: logStream
  };

  res.redirect('/');
});

app.get('/stop/:botKey', authRequired, (req, res) => {
  const botKey = req.params.botKey;
  if (!processMap[botKey]) {
    return res.send(`Bot "${botKey}" is not running.`);
  }

  const { proc, logFile } = processMap[botKey];
  proc.kill();
  logFile.end();
  delete processMap[botKey];

  res.redirect('/');
});

app.get('/logs/:botKey', authRequired, (req, res) => {
  const botKey = req.params.botKey;
  if (!BOTS[botKey]) {
    return res.status(404).send("Bot not found.");
  }

  const logFilePath = path.join(LOG_DIR, `${botKey}.log`);
  if (!fs.existsSync(logFilePath)) {
    return res.send("No logs yet.");
  }

  // We'll read the file and display it (auto-refresh every 2 seconds)
  const content = fs.readFileSync(logFilePath, "utf-8");
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Logs - ${botKey}</title>
    <meta http-equiv="refresh" content="2" />
    <style>
      body { background: #111; color: #eee; font-family: monospace; padding: 20px; }
      pre { white-space: pre-wrap; word-wrap: break-word; }
    </style>
  </head>
  <body>
    <h1>Logs for ${botKey}</h1>
    <pre>${content.replace(/</g, "&lt;")}</pre>
  </body>
  </html>
  `;
  res.send(html);
});

// Optionally auto-start all bots on server boot
function autoStartAllBots() {
  Object.keys(BOTS).forEach(botKey => {
    if (!processMap[botKey]) {
      // Same logic as /start
      const { cmd, script, type = 'script', workDir } = BOTS[botKey];
      const logFilePath = path.join(LOG_DIR, `${botKey}.log`);
      const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

      // Normalize and resolve paths using the same function as /start route
      function normalizePath(inputPath) {
        if (!inputPath) return '';
        // Convert Windows backslashes to forward slashes
        const normalized = inputPath.replace(/\\/g, '/');
        // Resolve absolute or relative path
        return path.isAbsolute(normalized) ? normalized : path.join(__dirname, normalized);
      }

      // Handle script path
      const scriptPath = script ? normalizePath(script) : '';
      
      // Determine working directory
      let workingDir;
      if (workDir) {
        workingDir = normalizePath(workDir);
      } else if (script) {
        workingDir = path.dirname(scriptPath);
      } else {
        workingDir = __dirname;
      }

      // Parse command and arguments
      let command, args;
      if (type === 'npm') {
        command = 'npm';
        args = ['run', cmd];
      } else if (type === 'custom') {
        const parts = cmd.split(' ');
        command = parts[0];
        args = parts.slice(1);
        if (script) {
          args.push(scriptPath);
        }
      } else {
        command = cmd;
        args = script ? [scriptPath] : [];
      }

      // Spawn the process
      console.log(`[${botKey}] Spawning process:`, { command, args, workingDir, type });
      const child = spawn(command, args, {
        cwd: workingDir,
        detached: false,
        shell: type === 'custom' // Enable shell for custom commands
      });
      child.stdout.on('data', data => {
        logStream.write(data);
        io.to(botKey).emit('output', { type: 'stdout', data: data.toString(), botKey });
      });
      child.stderr.on('data', data => {
        logStream.write(data);
        io.to(botKey).emit('output', { type: 'stderr', data: data.toString(), botKey });
      });
      child.on('close', code => {
        logStream.write(`\nProcess exited with code ${code}\n`);
        logStream.end();
        delete processMap[botKey];
        io.to(botKey).emit('status', { status: 'stopped', code, botKey });
      });

      processMap[botKey] = { proc: child, logFile: logStream };
    }
  });
}

// Start the server
server.listen(PORT, () => {
  console.log(`Bot manager listening at http://0.0.0.0:${PORT}`);
  if (AUTO_START) {
    console.log("Auto-starting all bots...");
    autoStartAllBots();
  }
});
