/* -------------------------------------------------------------------
   WEBSOCKET INTEGRATION TEMPLATE
   
   This file provides ready-to-use WebSocket client code for connecting
   the KEMO Control Center frontend to your ESP32 hexabot backend.
   
   Usage: Include this as <script> tag in projects-hub.html or merge into
   the main script section.
   ------------------------------------------------------------------- */

class HexabotWebSocket {
    constructor(serverUrl = 'ws://192.168.4.1:81') {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.isConnected = false;
        this.messageQueue = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000; // ms
        
        console.log(`[HexabotWS] Initializing WebSocket client at ${serverUrl}`);
    }

    connect() {
        try {
            this.ws = new WebSocket(this.serverUrl);
            
            this.ws.onopen = () => this.onOpen();
            this.ws.onmessage = (event) => this.onMessage(event);
            this.ws.onerror = (error) => this.onError(error);
            this.ws.onclose = () => this.onClose();
        } catch (error) {
            console.error('[HexabotWS] Connection error:', error);
            this.scheduleReconnect();
        }
    }

    onOpen() {
        console.log('[HexabotWS] Connected to ESP32 backend');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Update UI status indicator
        updateNetworkStatus(true);
        
        // Flush queued messages
        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            this.send(msg);
        }
        
        // Request initial state
        this.requestSystemStatus();
        
        addTerminalLog('[INFO] WebSocket connected to ESP32', 'info');
    }

    onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            this.handleIncomingData(data);
        } catch (error) {
            console.error('[HexabotWS] Message parse error:', error, event.data);
        }
    }

    onError(error) {
        console.error('[HexabotWS] WebSocket error:', error);
        addTerminalLog('[ERROR] WebSocket connection error', 'error');
    }

    onClose() {
        console.warn('[HexabotWS] WebSocket closed');
        this.isConnected = false;
        updateNetworkStatus(false);
        this.scheduleReconnect();
    }

    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            console.log(`[HexabotWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
            setTimeout(() => this.connect(), delay);
        } else {
            addTerminalLog('[ERROR] Max reconnection attempts reached', 'error');
        }
    }

    send(data) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            try {
                const json = typeof data === 'string' ? data : JSON.stringify(data);
                this.ws.send(json);
            } catch (error) {
                console.error('[HexabotWS] Send error:', error);
            }
        } else {
            console.warn('[HexabotWS] Not connected, queueing message');
            this.messageQueue.push(data);
        }
    }

    /* 
       COMMAND SENDING
        */

    setGait(gaitName) {
        this.send({
            command: 'setGait',
            gait: gaitName.toLowerCase(),
            timestamp: Date.now()
        });
    }

    setHeight(mm) {
        this.send({
            command: 'setHeight',
            height: parseFloat(mm),
            timestamp: Date.now()
        });
    }

    setOrientation(pitch, roll, yaw) {
        this.send({
            command: 'setOrientation',
            pitch: parseFloat(pitch),
            roll: parseFloat(roll),
            yaw: parseFloat(yaw),
            timestamp: Date.now()
        });
    }

    setJoystick(angle, magnitude = 1.0) {
        this.send({
            command: 'setJoystick',
            angle: parseFloat(angle),
            magnitude: parseFloat(magnitude),
            timestamp: Date.now()
        });
    }

    emergencyStop() {
        this.send({
            command: 'emergencyStop',
            timestamp: Date.now()
        });
        addTerminalLog('[WARN] Emergency stop command sent', 'warn');
    }

    requestSystemStatus() {
        this.send({
            command: 'getStatus',
            timestamp: Date.now()
        });
    }

    /* 
       DATA HANDLING
        */

    handleIncomingData(data) {
        if (!data) return;

        // Update leg telemetry
        if (data.legs && Array.isArray(data.legs)) {
            this.updateLegTelemetry(data.legs);
        }

        // Update battery
        if (data.battery !== undefined) {
            this.updateBattery(data.battery);
        }

        // Update IMU
        if (data.imu) {
            this.updateIMU(data.imu);
        }

        // Update system info
        if (data.system) {
            this.updateSystemInfo(data.system);
        }

        // Handle system messages
        if (data.message) {
            this.handleSystemMessage(data.message);
        }

        // Update current gait
        if (data.gait) {
            this.updateGaitDisplay(data.gait);
        }
    }

    updateLegTelemetry(legs) {
        legs.forEach((leg, idx) => {
            if (leg.id !== undefined) {
                const legId = leg.id;
                
                if (leg.theta1 !== undefined) {
                    const elem = document.getElementById(`leg-${legId}-j1`);
                    if (elem) elem.textContent = Math.round(leg.theta1) + ' deg';
                }
                
                if (leg.theta2 !== undefined) {
                    const elem = document.getElementById(`leg-${legId}-j2`);
                    if (elem) elem.textContent = Math.round(leg.theta2) + ' deg';
                }
                
                if (leg.temp !== undefined) {
                    const elem = document.getElementById(`leg-${legId}-t`);
                    if (elem) elem.textContent = Math.round(leg.temp) + ' degC';
                }
            }
        });
    }

    updateBattery(voltage) {
        // Update chart (scale voltage to percentage for visualization)
        const percentage = Math.min(100, Math.max(0, (voltage - 9) / 3 * 100));
        const bars = document.querySelectorAll('#battery-chart .chart-bar');
        bars.forEach((bar, idx) => {
            bar.style.height = (percentage * (0.8 + Math.random() * 0.2)) + '%';
        });
        
        console.log(`[Battery] ${voltage.toFixed(2)}V (${percentage.toFixed(1)}%)`);
    }

    updateIMU(imu) {
        if (!imu) return;
        
        // Update IMU chart visualization
        const bars = document.querySelectorAll('#imu-chart .chart-bar');
        const values = [
            Math.abs(imu.roll || 0),
            Math.abs(imu.pitch || 0),
            Math.abs(imu.yaw || 0),
            (imu.temperature || 0)
        ];
        
        bars.forEach((bar, idx) => {
            if (values[idx] !== undefined) {
                const height = Math.min(100, Math.max(0, values[idx]));
                bar.style.height = height + '%';
            }
        });
    }

    updateSystemInfo(sysInfo) {
        if (sysInfo.rssi !== undefined) {
            console.log(`[RSSI] ${sysInfo.rssi} dBm`);
        }
    }

    handleSystemMessage(message) {
        console.log('[ESP32]', message.text);
        
        const type = message.type || 'info';
        addTerminalLog(`[${type.toUpperCase()}] ${message.text}`, type);
    }

    updateGaitDisplay(gaitName) {
        const buttons = document.querySelectorAll('.gait-btn');
        buttons.forEach(btn => {
            const gaitText = btn.textContent.toLowerCase();
            if (gaitText.includes(gaitName.toLowerCase())) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

/* -------------------------------------------------------------------
   GLOBAL INSTANCE & INITIALIZATION
   ------------------------------------------------------------------- */

let hexabotWS = null;

function initializeWebSocket(serverUrl = 'ws://192.168.4.1:81') {
    hexabotWS = new HexabotWebSocket(serverUrl);
    hexabotWS.connect();
    
    // Set up event listeners for UI controls
    setupWebSocketEventListeners();
}

function setupWebSocketEventListeners() {
    // Gait buttons
    document.querySelectorAll('.gait-btn').forEach(btn => {
        const originalOnClick = btn.onclick;
        btn.onclick = (event) => {
            const gaitName = event.target.textContent.toLowerCase();
            if (hexabotWS && hexabotWS.isConnected) {
                hexabotWS.setGait(gaitName);
            }
        };
    });

    // Height slider
    const heightSlider = document.querySelector('input[type="range"][onchange*="height"]');
    if (heightSlider) {
        heightSlider.addEventListener('change', (e) => {
            if (hexabotWS && hexabotWS.isConnected) {
                hexabotWS.setHeight(e.target.value);
            }
        });
    }

    // Joystick interaction
    const joystick = document.getElementById('joystick');
    if (joystick) {
        joystick.addEventListener('mousemove', (e) => {
            if (hexabotWS && hexabotWS.isConnected) {
                const rect = joystick.getBoundingClientRect();
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const x = e.clientX - rect.left - centerX;
                const y = e.clientY - rect.top - centerY;
                const distance = Math.sqrt(x * x + y * y);
                const maxDistance = rect.width / 2;
                const magnitude = Math.min(1.0, distance / maxDistance);
                const angle = Math.atan2(y, x) * (180 / Math.PI);
                
                hexabotWS.setJoystick(angle, magnitude);
            }
        });
    }

    // Emergency stop button
    const estopBtn = document.querySelector('.emergency-btn');
    if (estopBtn) {
        estopBtn.addEventListener('click', () => {
            if (hexabotWS) {
                hexabotWS.emergencyStop();
            }
        });
    }
}

function updateNetworkStatus(isConnected) {
    const dot = document.querySelector('.status-dot.online') || document.querySelector('.status-dot');
    const label = document.getElementById('network-status');
    
    if (dot) {
        if (isConnected) {
            dot.classList.remove('offline');
            dot.classList.add('online');
        } else {
            dot.classList.remove('online');
            dot.classList.add('offline');
        }
    }
    
    if (label) {
        label.textContent = isConnected ? 'ONLINE' : 'OFFLINE';
    }
}

/* -------------------------------------------------------------------
   INITIALIZATION (Call on page load)
   ------------------------------------------------------------------- */

// Uncomment to enable WebSocket on page load:
// window.addEventListener('load', () => {
//     initializeWebSocket('ws://YOUR_ESP32_IP:81');
// });

/* -------------------------------------------------------------------
   EXAMPLE: Manually trigger commands from browser console
   -------------------------------------------------------------------

   // In browser console (F12):
   
   initializeWebSocket('ws://192.168.4.1:81');              // Connect
   hexabotWS.setGait('tripod');                              // Set gait
   hexabotWS.setHeight(10);                                  // Set height
   hexabotWS.setOrientation(5, 0, 0);                        // Pitch 5 deg
   hexabotWS.requestSystemStatus();                          // Get status
   hexabotWS.emergencyStop();                                // E-STOP

   ------------------------------------------------------------------- */



