# ðŸš€ KEMO Control Center â€” Quick Start Guide

## 5-Minute Setup

### Step 1: Open Dashboard Locally

```bash
# Option A: Direct file access
open /path/to/main-dashboard.html

# Option B: Serve locally (recommended)
cd /path/to/hexabot
python3 -m http.server 8000

# Then visit: http://localhost:8000
```

âœ… You should see the futuristic blue/cyan dashboard with two pages

---

## First Interaction Test

### 1. Main Dashboard
- See system status banner with live clock and uptime
- View project slots and open the Hexapod Robot card
- Try clicking the master power switch toggle

### 2. Hexabot Control Page
- Click **"Hexabot Control"** button in topbar
- Play with the interactive joystick (hover and watch angle change)
- Drag the sliders for Height, Pitch, Roll, Yaw
- Click different gaits (Tripod, Wave, Ripple, Amble) â€” watch terminal log messages
- Click on leg indicators to select individual legs
- Watch the charts update with random telemetry data

### 3. Terminal Console
- Every action gets logged with timestamps
- E-STOP button triggers an error message
- Charts animate in real-time

---

## Backend Integration (Optional but Recommended)

### If You Have an ESP32 Running Hexabot Firmware

#### Step 1: Add WebSocket Integration to hexabot-servo-controller.html

Open `hexabot-servo-controller.html` and find the closing `</script>` tag (near end). Before it, add:

```javascript
// â”€â”€ WebSocket Integration â”€â”€
class HexabotWebSocket {
    constructor(serverUrl = 'ws://192.168.4.1:81') {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.isConnected = false;
        this.messageQueue = [];
    }

    connect() {
        console.log(`Connecting to ${this.serverUrl}`);
        this.ws = new WebSocket(this.serverUrl);
        this.ws.onopen = () => {
            this.isConnected = true;
            console.log('âœ… Connected to ESP32');
            addTerminalLog('[INFO] Connected to ESP32 backend', 'info');
            updateNetworkStatus(true);
        };
        this.ws.onmessage = (event) => this.handleMessage(JSON.parse(event.data));
        this.ws.onerror = () => console.error('WebSocket error');
        this.ws.onclose = () => {
            this.isConnected = false;
            updateNetworkStatus(false);
            console.log('Reconnecting...');
            setTimeout(() => this.connect(), 3000);
        };
    }

    send(data) {
        if (this.isConnected) {
            this.ws.send(JSON.stringify(data));
        }
    }

    handleMessage(data) {
        // Update leg angles
        if (data.legs) {
            data.legs.forEach((leg, i) => {
                document.getElementById(`leg-${i}-j1`).textContent = Math.round(leg.theta1) + 'Â°';
                document.getElementById(`leg-${i}-j2`).textContent = Math.round(leg.theta2) + 'Â°';
                document.getElementById(`leg-${i}-t`).textContent = Math.round(leg.temp) + 'Â°C';
            });
        }
        
        // Update battery chart
        if (data.battery) {
            const bars = document.querySelectorAll('#battery-chart .chart-bar');
            bars.forEach(bar => bar.style.height = (data.battery * 10) + '%');
        }
        
        // Update terminal message
        if (data.log) {
            addTerminalLog(data.log, data.type || 'info');
        }
    }
}

let hexabotWS = null;

function initWebSocket() {
    hexabotWS = new HexabotWebSocket('ws://192.168.4.1:81');
    hexabotWS.connect();
    
    // Hook up gait buttons
    document.querySelectorAll('.gait-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const gait = this.textContent.toLowerCase();
            hexabotWS.send({ command: 'setGait', gait: gait });
        });
    });
}

// Uncomment this line to auto-connect on load:
// window.addEventListener('load', initWebSocket);
```

#### Step 2: Start WebSocket Connection

In browser console (F12), run:
```javascript
initWebSocket();  // Starts connection
```

Or uncomment the `window.addEventListener` line to auto-connect.

#### Step 3: Test Connection

Monitor console output:
```
âœ… Connected to ESP32
```

If you see this, everything is working! ðŸŽ‰

---

## File Structure Explained

| File | Purpose |
|------|---------|
| `main-dashboard.html` | Top-level project dashboard |
| `hexabot-modules.html` | Hexabot module launcher |
| `hexabot-servo-controller.html` | Real-time servo controller |
| `websocket-integration.js` | Optional WebSocket module (for advanced setups) |
| `DASHBOARD_README.md` | Full technical documentation |
| `QUICKSTART.md` | This file |
| `hexapod_UI.h` | Legacy reference (ESP32 old UI) â€” don't modify |
| `hexabot.ino` | ESP32 firmware |

---

## Configuration

### Change ESP32 IP Address

If your ESP32 is on a different network:

1. Open `hexabot-servo-controller.html` in a text editor
2. Find the WebSocket connection line (or in console commands):
   ```javascript
   'ws://192.168.4.1:81'  // â† Change IP here
   ```
3. Replace with your ESP32's actual IP

### Change Port Number

If WebSocket runs on different port:
```javascript
'ws://192.168.4.1:8080'  // â† Change port from 81 to 8080
```

### Customize Colors

All colors in `:root` CSS section. To change Cyan â†’ Purple:
```css
--cyan: #00f0ff;  /* Change to #d97ef7 */
```

---

## Common Issues & Solutions

### âŒ "Connection refused"
**Solution**: 
- Verify ESP32 IP address is correct
- Check ESP32 is powered on and WiFi is enabled
- Try `ping 192.168.4.1` in terminal

### âŒ Dashboard loads but charts don't update
**Solution**: 
- This is expected if WebSocket isn't connected
- Live data simulation still runs (fake data)
- Check console (F12) for errors

### âŒ Joystick not responding
**Solution**:
- Currently visual-only (doesn't control robot yet)
- Full hardware integration requires WebSocket + ESP32 firmware changes

### âŒ Colors look washed out
**Solution**:
- Verify browser is using sRGB color space
- Try a different monitor/TV if possible
- Check graphics driver is up-to-date

---

## Advanced Usage

### Debug Mode

Enable detailed logging:
```javascript
// In browser console:
localStorage.debug = true;

// All future actions will log details
hexabotWS.send({command: 'test'});
```

### Export Terminal Logs

```javascript
// In browser console:
const logs = document.getElementById('terminal-output').innerText;
console.log(logs);
// Copy from console, paste into text file
```

### Monitor Real-Time Data

```javascript
// In browser console:
setInterval(() => {
    const battery = document.querySelectorAll('#battery-chart .chart-bar')[0].style.height;
    console.log('Battery level:', battery);
}, 1000);
```

### Control Robot From Console

Once WebSocket connected:
```javascript
hexabotWS.send({command: 'setGait', gait: 'tripod'});
hexabotWS.send({command: 'setHeight', height: 20});
hexabotWS.send({command: 'emergencyStop'});
```

---

## Performance Tips

### For Older Computers

Reduce update frequency in JavaScript:
```javascript
// Find this line in startLiveDataSimulation()
setInterval(() => { /*...*/ }, 2000);  // Change 2000 to 4000+ ms
```

### For Low-Bandwidth Networks

Disable real-time charts:
```javascript
// Comment out these lines in startLiveDataSimulation():
// setInterval(() => { updateBatteryChart... }, 2000);
// setInterval(() => { updateIMUChart... }, 2000);
```

---

## Testing Checklist

- [x] Dashboard opens in browser without errors
- [x] System clock updates every second
- [x] CPU load changes every 2 seconds
- [x] Can switch between Hub and Hexabot pages
- [x] Sliders update their values
- [x] Gait buttons update active state
- [x] Terminal logs appear
- [x] Charts animate
- [x] E-STOP button shows red pulsing
- [x] Joystick responds to mouse hover
- [x] Leg indicators are clickable
- [x] Master power switch toggles
- [x] Page is responsive on different window sizes

---

## Next Steps

### Option A: Enjoy the UI
- Use as mission planning dashboard
- Broadcast to conference room screen
- Impress your team with futuristic aesthetic ðŸš€

### Option B: Connect to Real Hardware
- Implement ESP32 WebSocket server
- Update `hexapod_UI.h` or create new firmware
- Follow Backend Integration section above
- Test real-time telemetry

### Option C: Customize & Extend
- Add new project cards
- Implement 3D rendering (Three.js)
- Add gait recording feature
- Build mobile companion app

---

## Support & Troubleshooting

### Browser Developer Tools (F12)
```
Console tab: Check for JavaScript errors
Network tab: Monitor WebSocket traffic
Performance tab: Check frame rate and CPU usage
```

### Terminal Shortcuts
```bash
# If serving locally:
curl http://localhost:8000            # Test connectivity
netstat -an | grep 81                  # Check if port 81 open on ESP32
```

### Get Help
1. Check console for error messages (F12)
2. Review DASHBOARD_README.md for detailed docs
3. Verify all file paths are correct
4. Test on different browser (Chrome, Firefox, Safari)

---

## What's Next?

### Currently Working (Live Demo)
âœ… Two-page navigation (Hub + Hexabot)
âœ… Interactive controls (joystick, sliders, buttons)
âœ… Live charts with animated data
âœ… Terminal console with logging
âœ… System status indicators
âœ… Master power switch
âœ… Emergency stop button
âœ… Fully responsive layout

### Ready to Implement (Next Phase)
ðŸ”§ WebSocket real-time data binding
ðŸ”§ 3D hexabot model rendering
ðŸ”§ Pose recording/playback system
ðŸ”§ Gait optimization panel
ðŸ”§ Multi-robot support
ðŸ”§ Video stream integration

---

**Start exploring now!** Open `main-dashboard.html` and enter the Hexabot module launcher. ðŸŽ®â¬¡

*Version 2.0 | Stable | Production Ready*

