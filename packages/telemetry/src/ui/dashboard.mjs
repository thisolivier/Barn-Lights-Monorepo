/**
 * LED Lights Telemetry Dashboard
 * Client-side JavaScript for real-time monitoring
 */

// Dashboard state
const state = {
  devices: new Map(),
  logs: [],
  components: new Set(),
  connected: false,
  reconnectAttempt: 0,
  maxLogs: 500
};

// DOM elements (initialized on load)
let elements = {};

// WebSocket connection
let ws = null;
let reconnectTimer = null;

/**
 * Initialize the dashboard
 */
export function init() {
  elements = {
    statusIndicator: document.getElementById('statusIndicator'),
    statusText: document.getElementById('statusText'),
    healthBadge: document.getElementById('healthBadge'),
    devicesOnline: document.getElementById('devicesOnline'),
    avgPacketLoss: document.getElementById('avgPacketLoss'),
    logBufferSize: document.getElementById('logBufferSize'),
    devicesGrid: document.getElementById('devicesGrid'),
    logsContainer: document.getElementById('logsContainer'),
    levelFilter: document.getElementById('levelFilter'),
    componentFilter: document.getElementById('componentFilter'),
    autoScroll: document.getElementById('autoScroll'),
    clearLogs: document.getElementById('clearLogs')
  };

  // Event listeners
  elements.levelFilter.addEventListener('change', renderLogs);
  elements.componentFilter.addEventListener('change', renderLogs);
  elements.clearLogs.addEventListener('click', clearLogs);

  // Refresh device last seen times
  setInterval(() => {
    if (state.devices.size > 0) {
      renderDevices();
    }
  }, 1000);

  // Start connection
  connect();
}

/**
 * Connect to WebSocket server
 */
function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  updateConnectionStatus('connecting');
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    state.connected = true;
    state.reconnectAttempt = 0;
    updateConnectionStatus('connected');
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleMessage(message);
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  };

  ws.onclose = () => {
    state.connected = false;
    updateConnectionStatus('disconnected');
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
}

/**
 * Schedule a reconnection attempt with exponential backoff
 */
function scheduleReconnect() {
  if (reconnectTimer) return;

  state.reconnectAttempt++;
  const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempt - 1), 30000);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(status) {
  elements.statusIndicator.className = 'status-indicator';

  switch (status) {
    case 'connected':
      elements.statusIndicator.classList.add('connected');
      elements.statusText.textContent = 'Connected';
      break;
    case 'connecting':
      elements.statusIndicator.classList.add('connecting');
      elements.statusText.textContent = 'Connecting...';
      break;
    case 'disconnected':
      elements.statusText.textContent = state.reconnectAttempt > 0
        ? `Reconnecting (${state.reconnectAttempt})...`
        : 'Disconnected';
      break;
  }
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(message) {
  switch (message.type) {
    case 'init':
      handleInit(message);
      break;
    case 'log':
      handleLog(message.entry);
      break;
    case 'heartbeat':
      handleHeartbeat(message.device);
      break;
  }
}

/**
 * Handle initialization message
 */
function handleInit(data) {
  // Initialize devices
  state.devices.clear();
  if (data.devices) {
    data.devices.forEach(device => {
      state.devices.set(device.id, device);
    });
  }
  renderDevices();

  // Initialize logs
  state.logs = [];
  if (data.recentLogs) {
    data.recentLogs.reverse().forEach(entry => {
      addLogEntry(entry, false);
    });
  }
  renderLogs();
}

/**
 * Handle new log entry
 */
function handleLog(entry) {
  addLogEntry(entry, true);
}

/**
 * Add a log entry to state
 */
function addLogEntry(entry, isNew) {
  // Track component for filter
  if (entry.component && !state.components.has(entry.component)) {
    state.components.add(entry.component);
    updateComponentFilter();
  }

  state.logs.push(entry);

  // Trim old logs
  while (state.logs.length > state.maxLogs) {
    state.logs.shift();
  }

  if (isNew) {
    renderNewLog(entry);
  }
}

/**
 * Handle device heartbeat
 */
function handleHeartbeat(device) {
  state.devices.set(device.id, device);
  renderDevices();
}

/**
 * Render all devices
 */
function renderDevices() {
  const devices = Array.from(state.devices.values());

  if (devices.length === 0) {
    elements.devicesGrid.innerHTML = `
      <div class="card no-devices">
        <p>No devices connected</p>
      </div>
    `;
    updateHealthDisplay({ status: 'unknown', onlineDevices: 0, totalDevices: 0, avgPacketLoss: 0 });
    return;
  }

  elements.devicesGrid.innerHTML = devices.map(device => `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${escapeHtml(device.id)}</span>
        <span class="device-status ${device.status}">${device.status}</span>
      </div>
      <div class="device-stats">
        <div class="stat-item">
          <span class="stat-label">IP Address</span>
          <span class="stat-value">${escapeHtml(device.source?.split(':')[0] || 'N/A')}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Uptime</span>
          <span class="stat-value">${formatUptime(device.uptime)}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Packet Loss</span>
          <span class="stat-value">${device.packetLoss?.toFixed(1) ?? 0}%</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Last Seen</span>
          <span class="stat-value">${formatTimeSince(device.lastHeartbeat)}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Link Status</span>
          <span class="stat-value">${device.stats?.link ?? 'N/A'}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Frames</span>
          <span class="stat-value">${device.stats?.framesReceived ?? 0} rx / ${device.stats?.framesMissed ?? 0} miss</span>
        </div>
      </div>
    </div>
  `).join('');

  // Update health display
  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const avgPacketLoss = devices.reduce((sum, d) => sum + (d.packetLoss || 0), 0) / devices.length;

  let status = 'unknown';
  if (devices.length === onlineDevices && avgPacketLoss < 5) {
    status = 'healthy';
  } else if (onlineDevices > 0 && avgPacketLoss < 20) {
    status = 'degraded';
  } else if (devices.length > 0) {
    status = 'critical';
  }

  updateHealthDisplay({
    status,
    onlineDevices,
    totalDevices: devices.length,
    avgPacketLoss
  });
}

/**
 * Update the health display section
 */
function updateHealthDisplay(health) {
  elements.healthBadge.className = `health-badge ${health.status}`;
  elements.healthBadge.textContent = health.status;
  elements.devicesOnline.textContent = `${health.onlineDevices} / ${health.totalDevices}`;
  elements.avgPacketLoss.textContent = `${health.avgPacketLoss?.toFixed(1) ?? 0}%`;
}

/**
 * Render all logs (used on filter change)
 */
function renderLogs() {
  const filteredLogs = getFilteredLogs();
  elements.logsContainer.innerHTML = filteredLogs.map(entry => renderLogEntry(entry)).join('');

  if (elements.autoScroll.checked) {
    elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
  }

  elements.logBufferSize.textContent = `${state.logs.length} / ${state.maxLogs}`;
}

/**
 * Render a single new log entry (append)
 */
function renderNewLog(entry) {
  const levelFilter = elements.levelFilter.value;
  const componentFilter = elements.componentFilter.value;

  if (levelFilter && entry.level !== levelFilter) return;
  if (componentFilter && entry.component !== componentFilter) return;

  const html = renderLogEntry(entry);
  elements.logsContainer.insertAdjacentHTML('beforeend', html);

  if (elements.autoScroll.checked) {
    elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
  }

  elements.logBufferSize.textContent = `${state.logs.length} / ${state.maxLogs}`;
}

/**
 * Render a log entry to HTML
 */
function renderLogEntry(entry) {
  const time = formatTime(entry.receivedAt || entry.ts);
  const level = entry.level || 'info';
  const component = entry.component || 'unknown';
  const message = entry.msg || JSON.stringify(entry);

  return `
    <div class="log-entry">
      <span class="log-time">${time}</span>
      <span class="log-level ${level}">${level}</span>
      <span class="log-component">[${escapeHtml(component)}]</span>
      <span class="log-message">${escapeHtml(message)}</span>
    </div>
  `;
}

/**
 * Get logs filtered by current filter settings
 */
function getFilteredLogs() {
  const levelFilter = elements.levelFilter.value;
  const componentFilter = elements.componentFilter.value;

  return state.logs.filter(entry => {
    if (levelFilter && entry.level !== levelFilter) return false;
    if (componentFilter && entry.component !== componentFilter) return false;
    return true;
  });
}

/**
 * Update the component filter dropdown
 */
function updateComponentFilter() {
  const current = elements.componentFilter.value;
  const components = Array.from(state.components).sort();

  elements.componentFilter.innerHTML = '<option value="">All</option>' +
    components.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  elements.componentFilter.value = current;
}

/**
 * Clear all logs
 */
function clearLogs() {
  state.logs = [];
  state.components.clear();
  updateComponentFilter();
  renderLogs();
}

// Utility functions

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format timestamp to time string
 */
function formatTime(timestamp) {
  if (!timestamp) return '--:--:--';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Format time since timestamp
 */
function formatTimeSince(timestamp) {
  if (!timestamp) return 'N/A';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

/**
 * Format uptime milliseconds to human readable
 */
function formatUptime(ms) {
  if (!ms && ms !== 0) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
