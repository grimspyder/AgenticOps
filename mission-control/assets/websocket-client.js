/**
 * Mission Control Dashboard - WebSocket Client
 * Real-time communication with backend
 */

const WebSocketClient = {
  socket: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,
  reconnectDelay: 2000,
  listeners: new Map(),
  isConnected: false,
  
  // ===================
  // Connection
  // ===================
  
  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3001/ws`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    try {
      this.socket = new WebSocket(wsUrl);
      
      this.socket.onopen = (event) => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Update UI connection indicator
        this.updateConnectionIndicator(true);
        
        // Subscribe to dashboard events
        this.send({
          type: 'dashboard:subscribe',
          payload: {
            subscriptions: ['*']
          }
        });
        
        // Notify listeners
        this.emit('connected', {});
      };
      
      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
      
      this.socket.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.isConnected = false;
        this.updateConnectionIndicator(false);
        this.emit('disconnected', { code: event.code, reason: event.reason });
        this.attemptReconnect();
      };
      
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', { error });
      };
      
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      this.attemptReconnect();
    }
  },
  
  // ===================
  // Reconnection
  // ===================
  
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      this.emit('reconnectFailed', {});
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`Attempting reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  },
  
  // ===================
  // Messaging
  // ===================
  
  send(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }
    console.warn('WebSocket not connected, message not sent');
    return false;
  },
  
  handleMessage(message) {
    const { type, payload, timestamp } = message;
    console.log('WS Received:', type, payload);
    
    // Emit event to listeners
    this.emit(type, payload);
    
    // Also emit wildcard listener
    this.emit('*', message);
  },
  
  // ===================
  // Event System
  // ===================
  
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  },
  
  off(event, callback) {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  },
  
  emit(event, data) {
    // Specific event listeners
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error('Listener error:', err);
        }
      });
    }
    
    // Wildcard listeners
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(callback => {
        try {
          callback({ type: event, data });
        } catch (err) {
          console.error('Wildcard listener error:', err);
        }
      });
    }
  },
  
  // ===================
  // UI Helpers
  // ===================
  
  updateConnectionIndicator(connected) {
    const indicator = document.getElementById('ws-connection-indicator');
    if (indicator) {
      indicator.className = connected ? 'ws-connected' : 'ws-disconnected';
      indicator.textContent = connected ? '🟢 Live' : '🔴 Reconnecting...';
    }
  },
  
  // ===================
  // Agent Methods
  // ===================
  
  // Register as agent
  registerAgent(agentId, name, capabilities = []) {
    this.send({
      type: 'agent:register',
      payload: { agentId, name, capabilities }
    });
  },
  
  // Report agent status
  reportStatus(agentId, status, currentTaskId = null, progress = 0) {
    this.send({
      type: 'agent:status',
      payload: { agentId, status, currentTaskId, progress }
    });
  },
  
  // Report task progress
  reportProgress(taskId, progress, message, logs = []) {
    this.send({
      type: 'agent:progress',
      payload: { taskId, progress, message, logs }
    });
  },
  
  // Complete a task
  completeTask(taskId, result = {}) {
    this.send({
      type: 'agent:complete',
      payload: { taskId, result }
    });
  },
  
  // ===================
  // Utility
  // ===================
  
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.listeners.clear();
  }
};

// Auto-connect when loaded
if (typeof window !== 'undefined') {
  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => WebSocketClient.connect());
  } else {
    WebSocketClient.connect();
  }
}

// Make globally available instead of ES6 export
window.WebSocketClient = WebSocketClient;
