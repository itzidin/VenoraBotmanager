// Initialize Socket.io
const socket = io({
    auth: {
        token: document.cookie.split('=')[1]
    }
});
console.log('Socket.io initialized');
socket.on('connect', () => {
    console.log('Socket.io connected');
});

// Command type change handler
document.getElementById('commandType').addEventListener('change', (e) => {
    const type = e.target.value;
    const scriptField = document.querySelector('.script-field');
    const workingDirField = document.querySelector('.working-dir-field');
    const commandLabel = document.querySelector('.command-label');
    const commandInput = document.querySelector('input[name="cmd"]');

    // Show/hide fields based on command type
    if (type === 'script') {
        scriptField.style.display = 'block';
        workingDirField.style.display = 'none';
        commandLabel.textContent = 'Command';
        commandInput.placeholder = 'e.g., python3 or node';
        scriptField.querySelector('input').required = true;
    } else if (type === 'custom') {
        scriptField.style.display = 'none';
        workingDirField.style.display = 'block';
        commandLabel.textContent = 'Custom Command';
        commandInput.placeholder = 'e.g., python3 -m http.server 8000';
        scriptField.querySelector('input').required = false;
    } else if (type === 'npm') {
        scriptField.style.display = 'none';
        workingDirField.style.display = 'block';
        commandLabel.textContent = 'NPM Script';
        commandInput.placeholder = 'e.g., start or dev';
        scriptField.querySelector('input').required = false;
    }
});

// Add new bot form handler
document.getElementById('addBotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const botData = Object.fromEntries(formData.entries());
    
    // Remove empty fields
    Object.keys(botData).forEach(key => {
        if (!botData[key]) {
            delete botData[key];
        }
    });
    
    try {
        const response = await fetch('/api/bots', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify(botData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Failed to add bot');
            return;
        }
        
        e.target.reset();
        updateBotList();
    } catch (error) {
        console.error('Error adding bot:', error);
        alert('Failed to add bot');
    }
});

// Delete bot handler
async function deleteBot(botKey) {
    if (!confirm(`Are you sure you want to delete bot "${botKey}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/bots/${botKey}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Failed to delete bot');
            return;
        }
        
        updateBotList();
    } catch (error) {
        console.error('Error deleting bot:', error);
        alert('Failed to delete bot');
    }
}

// Store terminal elements and their state
const terminals = new Map();

// Update user info
document.getElementById('userInfo').textContent = `Logged in as admin`;

// Create terminal for a bot
function createTerminal(botKey) {
    // Clone the terminal template
    const template = document.getElementById('terminalTemplate');
    const terminal = template.content.cloneNode(true);
    
    // Set up the terminal elements
    const container = terminal.querySelector('.terminal-container');
    const title = terminal.querySelector('.card-title');
    const pre = terminal.querySelector('.terminal');
    const clearButton = terminal.querySelector('.clear-logs');
    
    // Set unique IDs and content
    container.id = `terminal-${botKey}`;
    pre.id = `output-${botKey}`;
    title.textContent = botKey;
    
    // Add clear button handler
    clearButton.addEventListener('click', () => {
        pre.textContent = '';
    });
    
    // Store terminal info
    terminals.set(botKey, {
        container,
        pre,
        clearButton
    });
    
    return container;
}

// Function to fetch and display bot list
async function updateBotList() {
    try {
        const response = await fetch('/api/bots', {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const bots = await response.json();
        const botListElement = document.getElementById('botList');
        const botTerminals = document.getElementById('botTerminals');
        
        // Update bot list
        botListElement.innerHTML = Object.entries(bots).map(([key, bot]) => `
            <div class="bot-card" id="bot-${key}">
                <h6>${bot.name || key}</h6>
                ${bot.description ? `<p class="description">${bot.description}</p>` : ''}
                <div class="status ${bot.running ? 'running' : 'stopped'}">
                    ${bot.running ? '● Running' : '● Stopped'}
                </div>
                <div class="actions">
                    ${bot.running ? 
                        `<button class="btn btn-danger btn-sm" onclick="stopBot('${key}')">Stop</button>` :
                        `<button class="btn btn-success btn-sm" onclick="startBot('${key}')">Start</button>`
                    }
                    <button class="btn btn-outline-danger btn-sm" onclick="deleteBot('${key}')">Delete</button>
                </div>
            </div>
        `).join('');
        
        // Create terminals for new bots
        Object.keys(bots).forEach(botKey => {
            if (!terminals.has(botKey)) {
                const terminal = createTerminal(botKey);
                botTerminals.appendChild(terminal);
                socket.emit('joinBot', botKey);
                fetchLogs(botKey);
            }
        });
        
        // Remove terminals for deleted bots
        terminals.forEach((terminal, key) => {
            if (!bots[key]) {
                terminal.container.remove();
                terminals.delete(key);
            }
        });
    } catch (error) {
        console.error('Error updating bot list:', error);
    }
}

// Start bot
async function startBot(botKey) {
    try {
        const response = await fetch(`/start/${botKey}`, {
            credentials: 'same-origin'
        });
        if (response.ok) {
            updateBotList();
        }
    } catch (error) {
        console.error('Error starting bot:', error);
    }
}

// Stop bot
async function stopBot(botKey) {
    try {
        const response = await fetch(`/stop/${botKey}`, {
            credentials: 'same-origin'
        });
        if (response.ok) {
            updateBotList();
        }
    } catch (error) {
        console.error('Error stopping bot:', error);
    }
}

// Fetch logs for a bot
async function fetchLogs(botKey) {
    try {
        const response = await fetch(`/api/logs/${botKey}`, {
            credentials: 'same-origin'
        });
        const logs = await response.text();
        const terminal = terminals.get(botKey);
        if (terminal) {
            terminal.pre.textContent = logs;
            terminal.pre.scrollTop = terminal.pre.scrollHeight;
        }
    } catch (error) {
        console.error(`Error fetching logs for ${botKey}:`, error);
    }
}

// Socket.io event handlers
socket.on('connect', () => {
    console.log('Socket.io connected, joining rooms for existing bots...');
    terminals.forEach((terminal, botKey) => {
        console.log(`Joining room for bot: ${botKey}`);
        socket.emit('joinBot', botKey);
    });
});

socket.on('output', ({ type, data, botKey }) => {
    console.log(`Received ${type} output for bot ${botKey}:`, data);
    const terminal = terminals.get(botKey);
    if (terminal) {
        console.log(`Updating terminal for ${botKey}`);
        terminal.pre.textContent += data;
        terminal.pre.scrollTop = terminal.pre.scrollHeight;
    } else {
        console.warn(`No terminal found for bot ${botKey}`);
    }
});

socket.on('status', ({ status, code, botKey }) => {
    if (status === 'stopped') {
        updateBotList();
    }
});

// Initial bot list update
updateBotList();

// Poll for updates every 5 seconds
setInterval(updateBotList, 5000);
