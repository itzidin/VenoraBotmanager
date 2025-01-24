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

// Method selection handler
document.querySelectorAll('input[name="addMethod"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const scriptPathSection = document.getElementById('scriptPathSection');
        const fileUploadSection = document.getElementById('fileUploadSection');
        const scriptInput = document.querySelector('input[name="script"]');
        const cmdInput = document.querySelector('input[name="cmd"]');
        const fileInput = document.querySelector('input[name="scriptFile"]');

        if (e.target.value === 'scriptPath') {
            scriptPathSection.style.display = 'block';
            fileUploadSection.style.display = 'none';
            scriptInput.required = true;
            cmdInput.required = true;
            fileInput.required = false;
            fileInput.value = ''; // Clear file input when switching to script path
        } else {
            scriptPathSection.style.display = 'none';
            fileUploadSection.style.display = 'block';
            scriptInput.required = false;
            cmdInput.required = false;
            fileInput.required = true;
            scriptInput.value = ''; // Clear script path when switching to file upload
            cmdInput.value = ''; // Clear command when switching to file upload
        }
    });
});

// Add new bot form handler
document.getElementById('addBotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const selectedMethod = formData.get('addMethod');
    const fileInput = document.querySelector('input[name="scriptFile"]');
    const scriptPath = formData.get('script');
    const command = formData.get('cmd');
    
    // Validate based on selected method
    if (selectedMethod === 'scriptPath' && (!scriptPath || !command)) {
        alert('Please provide both script path and command when using Script Path method.');
        return;
    } else if (selectedMethod === 'fileUpload' && !fileInput.files.length) {
        alert('Please select a file when using File Upload method.');
        return;
    }
    
    try {
        let response;
        
        // Handle based on selected method
        if (selectedMethod === 'fileUpload') {
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
                credentials: 'same-origin',
                body: formData
            });
        } else {
            // Handle script path method
            const botData = Object.fromEntries(formData.entries());
            
            // Remove unnecessary fields
            delete botData.scriptFile;
            delete botData.addMethod;
            
            response = await fetch('/api/bots', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'same-origin',
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
