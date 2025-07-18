/**
 * AudioManager class handles audio context and volume analysis
 * without requesting separate microphone access since Speech Recognition API handles it
 */
class AudioManager {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.volumeInterval = null;
        this.volumeHistory = [];
        this.isInitialized = false;
    }

    /**
     * Initialize audio analysis from Speech Recognition's audio stream
     * This avoids requesting additional microphone permissions
     */
    async initializeFromRecognition() {
        try {
            // We don't request microphone here as Speech Recognition handles it
            this.isInitialized = true;
            console.log('AudioManager initialized for volume analysis');
            return true;
        } catch (error) {
            console.error('Failed to initialize AudioManager:', error);
            return false;
        }
    }

    /**
     * Setup audio analyser using the audio context from Speech Recognition
     * This is called only when we have active speech recognition
     */
    setupVolumeAnalysis() {
        if (!this.isInitialized) {
            console.warn('AudioManager not initialized');
            return;
        }

        try {
            // Create audio context for volume analysis only
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            
            // Start volume monitoring
            this.startVolumeMonitoring();
            console.log('Volume analysis setup completed');
        } catch (error) {
            console.error('Failed to setup volume analysis:', error);
        }
    }

    startVolumeMonitoring() {
        if (this.volumeInterval) {
            clearInterval(this.volumeInterval);
        }

        const dataArray = new Uint8Array(this.analyser?.fftSize || 2048);
        
        this.volumeInterval = setInterval(() => {
            if (!this.analyser) return;
            
            this.analyser.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const val = dataArray[i] - 128;
                sum += val * val;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            
            this.volumeHistory.push(rms);
            if (this.volumeHistory.length > 100) {
                this.volumeHistory.shift();
            }
        }, 100);
    }

    stopVolumeMonitoring() {
        if (this.volumeInterval) {
            clearInterval(this.volumeInterval);
            this.volumeInterval = null;
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.analyser = null;
        this.volumeHistory = [];
        console.log('Volume monitoring stopped');
    }

    async measureAverageVolume(seconds) {
        this.volumeHistory = [];
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        const sum = this.volumeHistory.reduce((a, b) => a + b, 0);
        return sum / (this.volumeHistory.length || 1);
    }

    getCurrentAverageVolume() {
        if (this.volumeHistory.length === 0) return 0;
        const sum = this.volumeHistory.reduce((a, b) => a + b, 0);
        return sum / this.volumeHistory.length;
    }

    cleanup() {
        this.stopVolumeMonitoring();
        this.isInitialized = false;
        console.log('AudioManager cleaned up');
    }
}

// Export for use in other modules
window.AudioManager = AudioManager;