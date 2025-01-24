const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');

// Set up file upload configuration
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Sanitize filename and ensure unique names
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${sanitizedName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only .py, .js, and .sh files
    const allowedExtensions = ['.py', '.js', '.sh'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .py, .js, and .sh files are allowed'));
    }
  }
});


// change the port as needed
const PORT = 8080;

// User credentials (username -> hashed password)
const USERS = {
  admin: '$2b$10$Rt5RwDyBx9tJd4JGEQYHtuN4J2aLlhrmNRn5RiZ.MtabW6juUO5Em' // password: admin123 / password is bcrypted
};

const SESSION_SECRET = 'your-secret-key-here';

const CONFIG_DIR = path.join(__dirname, "config");
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

const BOT_CONFIG_FILE = path.join(CONFIG_DIR, "bots.json");
let BOTS = {
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

function loadBotConfig() {
  try {
    if (fs.existsSync(BOT_CONFIG_FILE)) {
      const configData = fs.readFileSync(BOT_CONFIG_FILE, 'utf8');
      BOTS = JSON.parse(configData);
    } else {
      saveBotConfig();
    }
  } catch (error) {
    console.error('Error loading bot configuration:', error);
  }
}

function saveBotConfig() {
  try {
    fs.writeFileSync(BOT_CONFIG_FILE, JSON.stringify(BOTS, null, 2));
  } catch (error) {
    console.error('Error saving bot configuration:', error);
  }
}

loadBotConfig();

const LOG_DIR = path.join(__dirname, "logs");

const AUTO_START = true;


if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const processMap = {};

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const staticMiddleware = express.static('public');

app.use((req, res, next) => {
  if (req.session && req.session.user) {
    return staticMiddleware(req, res, next);
  } else if (req.path === '/login') {
    return next();
  } else {
    return res.redirect('/login');
  }
});

function authRequired(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
}

io.on('connection', (socket) => {
  socket.on('joinBot', (botKey) => {
    socket.join(botKey);
  });
});

// Handle file upload and bot creation
app.post('/api/upload', authRequired, upload.single('scriptFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let defaultCmd;
    switch (fileExt) {
      case '.py':
        defaultCmd = 'python3';
        break;
      case '.js':
        defaultCmd = 'node';
        break;
      case '.sh':
        defaultCmd = 'bash';
        break;
      default:
        return res.status(400).json({ error: "Unsupported file type" });
    }

    // Create unique bot ID using filename (without extension) and timestamp
    const botId = `${path.basename(req.file.originalname, fileExt)}_${Date.now()}`;

    // Create bot entry
    BOTS[botId] = {
      script: path.join('uploads', req.file.filename),
      cmd: defaultCmd,
      type: 'script',
      name: path.basename(req.file.originalname, fileExt),
      description: `Uploaded script: ${req.file.originalname}`
    };

    saveBotConfig();
    res.json({ 
      success: true, 
      bot: BOTS[botId],
      message: `Bot "${botId}" created successfully`
    });
  } catch (error) {
    console.error('Error handling file upload:', error);
    res.status(500).json({ error: error.message || "File upload failed" });
  }
});

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

app.delete('/api/bots/:botKey', authRequired, (req, res) => {
    const botKey = req.params.botKey;
    
    if (!BOTS[botKey]) {
        return res.status(404).json({ error: "Bot not found" });
    }

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

app.get('/', authRequired, (req, res) => {
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

  function normalizePath(inputPath) {
    if (!inputPath) return '';
    
    const normalized = inputPath.replace(/\\/g, '/');
    
    const isWindowsAbsolute = /^[A-Za-z]:/i.test(normalized);
    
    if (isWindowsAbsolute) {
      return normalized;
    } else if (path.isAbsolute(normalized)) {
      return normalized;
    } else {
      return path.join(__dirname, normalized);
    }
  }

  const scriptPath = script ? normalizePath(script) : '';
  
  let workingDir;
  if (workDir) {
    workingDir = normalizePath(workDir);
  } else if (script) {
    workingDir = path.dirname(scriptPath);
  } else {
    workingDir = __dirname;
  }

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

  console.log(`[${botKey}] Spawning process:`, { command, args, workingDir, type });
  const child = spawn(command, args, {
    cwd: workingDir,
    detached: false,
    shell: type === 'custom'
  });
  
  console.log(`[${botKey}] Process spawned with PID:`, child.pid);

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

function autoStartAllBots() {
  Object.keys(BOTS).forEach(botKey => {
    if (!processMap[botKey]) {
      const { cmd, script, type = 'script', workDir } = BOTS[botKey];
      const logFilePath = path.join(LOG_DIR, `${botKey}.log`);
      const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

      function normalizePath(inputPath) {
        if (!inputPath) return '';
        const normalized = inputPath.replace(/\\/g, '/');
        return path.isAbsolute(normalized) ? normalized : path.join(__dirname, normalized);
      }

      const scriptPath = script ? normalizePath(script) : '';
      
      let workingDir;
      if (workDir) {
        workingDir = normalizePath(workDir);
      } else if (script) {
        workingDir = path.dirname(scriptPath);
      } else {
        workingDir = __dirname;
      }

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

      console.log(`[${botKey}] Spawning process:`, { command, args, workingDir, type });
      const child = spawn(command, args, {
        cwd: workingDir,
        detached: false,
        shell: type === 'custom'
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

server.listen(PORT, () => {
  console.log(`Bot manager listening at http://0.0.0.0:${PORT}`);
  if (AUTO_START) {
    console.log("Auto-starting all bots...");
    autoStartAllBots();
  }
});
