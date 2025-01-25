# Venora Bot Manager

## ✨ Overview

Venora Bot Manager is a powerful, web-based application for managing and monitoring multiple bots in real-time. It provides a **secure** and **intuitive interface** to control Python, Node.js, and custom script processes with live terminal output.

---

## 🔒 Features

- **Secure Authentication System**
- **Real-Time Terminal Output Monitoring**
- **Multi-Bot Support**: Python, Node.js, and custom scripts
- **Auto-Restart Capabilities**
- **Cross-Platform Compatibility**: Windows & Linux
- **Easy Setup**
- **Modern Web Interface**

---

## ⚙️ Installation

### Prerequisites

- **Node.js** (v14 or higher)
- **npm** (Node Package Manager)
- **Python** (required for Python bots)

### Setup Instructions

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/itzidin/VenoraBotmanager
   cd VenoraBotmanager
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start the Server**:
   ```bash
   npm start
   ```

4. **Access the Web Interface**:
   Open your browser and navigate to [http://localhost:8080](http://localhost:8080).

   **Default Credentials**:
   - Username: `admin`
   - Password: `admin123`

---

## 💻 Web Interface

### 📈 Dashboard Features

- **Real-Time Monitoring**: Check bot statuses and outputs instantly.
- **Control Bots**: Start, stop, or restart bots with one click.
- **Log Management**: View and clear bot logs.
- **Configuration Management**: Update bot settings directly from the interface.

### 📝 Adding New Bots

1. Go to the **Add New Bot** section.
2. Fill in the required details:
   - **Bot ID**: Unique identifier for the bot.
   - **Command Type**: Script, custom command, or NPM script.
   - **Command or Script Path**.
   - **Working Directory** (optional).
   - **Name and Description** (optional).
3. Click **Add Bot** to save.

### ⚔️ Managing Bots

- **Start Bot**: Click the "Start" button.
- **Stop Bot**: Click the "Stop" button.
- **View Logs**: Check terminal outputs in real time.
- **Clear Logs**: Use the "Clear Logs" option.
- **Delete Bot**: Remove bots with the "Delete" button.

---

## ⚡ Security

- **Session-Based Authentication**: Protects user sessions.
- **Bcrypt Password Hashing**: Enhances security for stored credentials.
- **Protected API Endpoints**: Prevents unauthorized access.
- **Secure Cookie Handling**: Ensures secure user sessions.

---

## 🚨 Troubleshooting

| ⚠ Issue                  | 🌐 Solution                                      |
|------------------------|----------------------------------------------|
| Bot Won't Start        | Verify file paths and permissions.           |
| Authentication Issues  | Check credentials or session configurations. |
| Terminal Output Issues | Ensure proper permissions for log directories. |

---

## 🔄 Project Structure

```
bot-manager/
├── config/              # Configuration files
├── public/              # Frontend assets
├── logs/                # Log directory
├── process.js           # Main server
└── package.json         # Dependencies
```

---

## 🌟 License

This project is licensed under the **MIT License**. Feel free to use and modify it as needed.

---

## 📞 Support

For any issues or feature requests, feel free to reach out to the team! ❤️
