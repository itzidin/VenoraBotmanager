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

    const fileUploadCard = document.querySelector('.file-upload-field').closest('.card');
    const scriptPathCard = document.querySelector('.script-field').closest('.card');
    
    // Show/hide fields based on command type
    if (type === 'script') {
        scriptPathCard.style.display = 'block';
        fileUploadCard.style.display = 'block';
        workingDirField.style.display = 'none';
        commandLabel.textContent = 'Command';
        commandInput.placeholder = 'e.g., python3 or node';
        scriptField.querySelector('input').required = false; // Not required since we have file upload option
    } else if (type === 'custom') {
        scriptPathCard.style.display = 'none';
        fileUploadCard.style.display = 'none';
        workingDirField.style.display = 'block';
        commandLabel.textContent = 'Custom Command';
        commandInput.placeholder = 'e.g., python3 -m http.server 8000';
        scriptField.querySelector('input').required = false;
    } else if (type === 'npm') {
        scriptPathCard.style.display = 'none';
        fileUploadCard.style.display = 'none';
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
    const fileInput = document.querySelector('input[name="scriptFile"]');
    const scriptPath = formData.get('script');
    const command = formData.get('cmd');
    
    // Validate input methods
    if (fileInput.files.length > 0 && scriptPath) {
        alert('Please use either file upload or script path, not both.');
        return;
    }
    
    if (fileInput.files.length === 0 && !scriptPath) {
        alert('Please either upload a file or provide a script path.');
        return;
    }
    
    try {
        let response;
        
        // Handle file upload
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            
            // Validate file type
            const allowedTypes = ['.py', '.js', '.sh'];
            const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            if (!allowedTypes.includes(fileExt)) {
                alert('Only .py, .js, and .sh files are allowed.');
                return;
            }
            
            // Add auto-selected command based on file type
            switch (fileExt) {
                case '.py':
                    formData.append('cmd', 'python3');
                    break;
                case '.js':
                    formData.append('cmd', 'node');
                    break;
                case '.sh':
                    formData.append('cmd', 'bash');
                    break;
            }
            
            // Upload file
            response = await fetch('/api/upload', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
        } else {
            // Handle script path method
            const botData = Object.fromEntries(formData.entries());
            
            // Remove empty fields and file input
            Object.keys(botData).forEach(key => {
                if (!botData[key] || key === 'scriptFile') {
                    delete botData[key];
                }
            });
            
            if (!botData.script || !botData.cmd) {
                alert('Please provide both script path and command when using Method 1.');
                return;
            }
            
            response = await fetch('/api/bots', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(botData)
            });
        }
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Failed to add bot');
            return;
        }
        
        const result = await response.json();
        if (result.message) {
            alert(result.message); // Show success message for file uploads
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
            credentials: 'include'
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
            credentials: 'include',
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
            credentials: 'include'
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
            credentials: 'include'
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
            credentials: 'include'
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
