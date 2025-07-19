/**
 * ChannelManager handles differentiation between P1 (VB Cable/Interviewer) 
 * and P2 (Microphone/Interviewee) channels for question detection
 */
class ChannelManager {
    constructor() {
        this.currentChannel = 'P1'; // Default to VB Cable channel
        this.channelHistory = [];
        this.volumeLevels = { P1: 0, P2: 0 };
        this.channelThreshold = 0.1; // Minimum volume to detect activity
        this.channelSwitchDelay = 500; // ms before switching channels
        this.lastChannelSwitch = 0;
        
        // Channel configuration
        this.channels = {
            P1: {
                name: 'VB Cable',
                description: 'Interviewer (Questions source)',
                badge: 'P1',
                color: '#ff6b6b',
                detectQuestions: true // Only P1 should trigger question detection
            },
            P2: {
                name: 'Microphone', 
                description: 'Interviewee (Answers source)',
                badge: 'P2',
                color: '#4ecdc4',
                detectQuestions: false // P2 should not trigger question detection
            }
        };
        
        this.setupWebSocketConnection();
    }

    setupWebSocketConnection() {
        // Connect to server WebSocket for audio level monitoring
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('ChannelManager connected to server');
            this.ws.send(JSON.stringify({ type: 'set-person', person: 'channel-manager' }));
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };
        
        this.ws.onclose = () => {
            console.log('ChannelManager disconnected from server');
            setTimeout(() => this.setupWebSocketConnection(), 3000);
        };
    }

    handleServerMessage(data) {
        switch (data.type) {
            case 'audio-processed':
                this.updateChannelActivity(data.person, data.timestamp);
                break;
            case 'audio-levels':
                this.updateVolumeLevels(data.levels);
                break;
        }
    }

    updateChannelActivity(channel, timestamp) {
        // Record channel activity
        this.channelHistory.push({
            channel: channel,
            timestamp: timestamp,
            active: true
        });
        
        // Keep history manageable (last 50 entries)
        if (this.channelHistory.length > 50) {
            this.channelHistory.shift();
        }
        
        // Update current active channel based on recent activity
        this.updateCurrentChannel(channel, timestamp);
    }

    updateVolumeLevels(levels) {
        this.volumeLevels = { ...this.volumeLevels, ...levels };
    }

    updateCurrentChannel(channel, timestamp) {
        const now = timestamp || Date.now();
        
        // Don't switch too frequently
        if (now - this.lastChannelSwitch < this.channelSwitchDelay) {
            return;
        }
        
        // Switch channel if different from current
        if (this.currentChannel !== channel) {
            console.log(`Switching active channel from ${this.currentChannel} to ${channel}`);
            this.currentChannel = channel;
            this.lastChannelSwitch = now;
            
            // Notify listeners about channel change
            this.notifyChannelChange(channel);
        }
    }

    notifyChannelChange(channel) {
        // Dispatch custom event for channel change
        const event = new CustomEvent('channelChanged', {
            detail: {
                channel: channel,
                channelInfo: this.channels[channel],
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    }

    getCurrentChannel() {
        return this.currentChannel;
    }

    getChannelInfo(channel = null) {
        channel = channel || this.currentChannel;
        return this.channels[channel];
    }

    shouldDetectQuestions(channel = null) {
        channel = channel || this.currentChannel;
        return this.channels[channel]?.detectQuestions || false;
    }

    isVBCableChannel(channel = null) {
        channel = channel || this.currentChannel;
        return channel === 'P1';
    }

    isMicrophoneChannel(channel = null) {
        channel = channel || this.currentChannel;
        return channel === 'P2';
    }

    tagSentenceWithChannel(sentence, channel = null) {
        channel = channel || this.currentChannel;
        const channelInfo = this.getChannelInfo(channel);
        
        return {
            text: sentence,
            channel: channel,
            channelInfo: channelInfo,
            timestamp: Date.now(),
            shouldDetectQuestions: this.shouldDetectQuestions(channel)
        };
    }

    getRecentChannelActivity(durationMs = 5000) {
        const cutoff = Date.now() - durationMs;
        return this.channelHistory.filter(entry => entry.timestamp > cutoff);
    }

    getPredominantChannel(durationMs = 3000) {
        const recentActivity = this.getRecentChannelActivity(durationMs);
        
        if (recentActivity.length === 0) {
            return this.currentChannel;
        }
        
        // Count activity by channel
        const channelCounts = {};
        recentActivity.forEach(entry => {
            channelCounts[entry.channel] = (channelCounts[entry.channel] || 0) + 1;
        });
        
        // Return channel with most activity
        return Object.keys(channelCounts).reduce((a, b) => 
            channelCounts[a] > channelCounts[b] ? a : b
        );
    }

    getChannelStats() {
        return {
            currentChannel: this.currentChannel,
            channelHistory: this.channelHistory.slice(-10), // Last 10 activities
            volumeLevels: this.volumeLevels,
            channels: this.channels
        };
    }

    // Method to manually set channel (for testing or manual override)
    setChannel(channel) {
        if (this.channels[channel]) {
            this.updateCurrentChannel(channel);
            return true;
        }
        return false;
    }

    // Clean up WebSocket connection
    cleanup() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Make ChannelManager available globally for debugging
window.ChannelManager = ChannelManager;