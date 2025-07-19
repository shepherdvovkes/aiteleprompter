/**
 * SpeechRecognitionManager handles all speech recognition functionality
 * without redundant microphone access requests
 */
class SpeechRecognitionManager {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.recognition = null;
        this.isListening = false;
        this.hasStartedBefore = false;
        this.shouldRestart = false;
        
        // Timing constants
        this.SILENCE_THRESHOLD = 5000;
        this.CHUNK_DURATION = 30000;
        this.SENTENCE_PAUSE_THRESHOLD = 2000;
        this.PERIODIC_THRESHOLD = 20000;
        this.RECONNECT_DELAY = 1000; // Delay before automatic reconnection
        
        // Timers
        this.silenceTimer = null;
        this.chunkTimer = null;
        this.sentencePauseTimer = null;
        this.periodicTimer = null;
        
        // State
        this.partialSentence = '';
        this.lockedInterim = '';
        this.interimText = '';
        this.lastLoggedSentence = '';
        this.continuousMode = false; // Flag for continuous listening
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Callbacks
        this.onTranscriptUpdate = null;
        this.onStatusChange = null;
        this.onSentenceFinalized = null;
        
        this.initializeRecognition();
    }

    initializeRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.error('Speech Recognition not supported in this browser');
            return false;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        
        this.setupEventHandlers();
        console.log('Speech Recognition initialized');
        return true;
    }

    setupEventHandlers() {
        if (!this.recognition) return;

        this.recognition.onstart = () => {
            if (!this.isListening) return; // ignore spurious starts
            
            console.log('Speech Recognition started');
            this.onStatusChange?.('listening', 'Listening...');
            
            if (!this.hasStartedBefore) {
                this.resetTranscription();
                this.hasStartedBefore = true;
            }
            
            this.startTimers();
        };

        this.recognition.onend = () => {
            console.log('Speech Recognition ended');
            this.clearAllTimers();
            
            if (this.shouldRestart && this.isListening) {
                this.shouldRestart = false;
                this.attemptRestart();
                return;
            }
            
            // If in continuous mode and still listening, attempt to restart
            if (this.continuousMode && this.isListening) {
                console.log('Continuous mode: attempting automatic restart');
                this.attemptRestart();
                return;
            }
            
            this.stopListening();
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            // Handle different types of errors
            if (event.error === 'network') {
                this.onStatusChange?.('error', 'Network error - will retry');
                if (this.continuousMode && this.reconnectAttempts < this.maxReconnectAttempts) {
                    setTimeout(() => this.attemptRestart(), this.RECONNECT_DELAY * (this.reconnectAttempts + 1));
                }
            } else if (event.error === 'not-allowed') {
                this.onStatusChange?.('error', 'Microphone access denied');
                this.continuousMode = false;
            } else if (event.error === 'aborted') {
                // This is normal during restart, don't show as error
                console.log('Recognition aborted (normal during restart)');
            } else {
                this.onStatusChange?.('error', `Error: ${event.error}`);
                if (this.continuousMode && this.reconnectAttempts < this.maxReconnectAttempts) {
                    setTimeout(() => this.attemptRestart(), this.RECONNECT_DELAY);
                }
            }
        };

        this.recognition.onresult = (event) => {
            this.handleRecognitionResult(event);
        };
    }

    handleRecognitionResult(event) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
            this.shouldRestart = true;
            this.recognition.stop();
        }, this.SILENCE_THRESHOLD);

        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcriptPart = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                if (transcriptPart.trim()) {
                    this.partialSentence += (this.partialSentence ? ' ' : '') + transcriptPart.trim();
                    
                    if (/[.!?]\s*$/.test(this.partialSentence)) {
                        this.finalizeSentence(this.partialSentence);
                        this.partialSentence = '';
                        clearTimeout(this.sentencePauseTimer);
                    } else {
                        clearTimeout(this.sentencePauseTimer);
                        this.sentencePauseTimer = setTimeout(() => {
                            if (this.partialSentence.trim()) {
                                this.finalizeSentence(this.partialSentence.trim());
                                this.partialSentence = '';
                            }
                        }, this.SENTENCE_PAUSE_THRESHOLD);
                    }
                }
            } else {
                interimTranscript += transcriptPart;
            }
        }
        
        this.interimText = interimTranscript;
        this.updateInterimDisplay();
    }

    async startListening(language = 'ru-RU', continuous = true) {
        if (this.isListening || !this.recognition) return false;

        this.recognition.lang = language;
        this.continuousMode = continuous;
        this.reconnectAttempts = 0;
        
        try {
            // Initialize audio manager without requesting microphone
            await this.audioManager.initializeFromRecognition();
            
            this.isListening = true;
            this.hasStartedBefore = false;
            this.recognition.start();
            
            console.log('Started listening with language:', language, 'continuous:', continuous);
            return true;
        } catch (error) {
            console.error('Failed to start listening:', error);
            this.onStatusChange?.('error', 'Failed to start listening');
            return false;
        }
    }

    attemptRestart() {
        if (!this.isListening || !this.recognition) return;
        
        this.reconnectAttempts++;
        console.log(`Attempting restart ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        try {
            this.recognition.start();
            this.chunkTimer = setInterval(() => {
                this.shouldRestart = true;
                this.recognition.stop();
            }, this.CHUNK_DURATION);
            
            // Reset reconnect attempts on successful restart
            this.reconnectAttempts = 0;
        } catch (error) {
            console.error('Restart attempt failed:', error);
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                setTimeout(() => {
                    this.attemptRestart();
                }, this.RECONNECT_DELAY * this.reconnectAttempts);
            } else {
                console.error('Max reconnect attempts reached');
                this.onStatusChange?.('error', 'Unable to maintain connection');
                this.continuousMode = false;
                this.stopListening();
            }
        }
    }

    stopListening() {
        if (!this.isListening || !this.recognition) return;

        this.isListening = false;
        this.recognition.stop();
        this.audioManager.stopVolumeMonitoring();
        
        if (this.partialSentence.trim()) {
            this.finalizeSentence(this.partialSentence.trim());
            this.partialSentence = '';
        }
        
        this.onStatusChange?.('stopped', 'Stopped');
        this.resetState();
        console.log('Stopped listening');
    }

    finalizeSentence(sentence) {
        if (sentence === this.lastLoggedSentence) return;
        
        this.lastLoggedSentence = sentence;
        this.onSentenceFinalized?.(sentence);
        console.log('Finalized sentence:', sentence);
    }

    updateInterimDisplay() {
        const displayText = (this.lockedInterim + ' ' + this.interimText).trim();
        this.onTranscriptUpdate?.(displayText, false);
    }

    startTimers() {
        this.clearAllTimers();
        
        this.periodicTimer = setInterval(() => {
            this.scheduleAnalysis();
        }, this.PERIODIC_THRESHOLD);
        
        this.chunkTimer = setInterval(() => {
            this.shouldRestart = true;
            this.recognition.stop();
        }, this.CHUNK_DURATION);
    }

    clearAllTimers() {
        const timers = [
            'silenceTimer', 'chunkTimer', 'sentencePauseTimer', 'periodicTimer'
        ];
        
        timers.forEach(timer => {
            if (this[timer]) {
                clearTimeout(this[timer]);
                clearInterval(this[timer]);
                this[timer] = null;
            }
        });
    }

    scheduleAnalysis() {
        if (this.partialSentence.trim()) {
            this.finalizeSentence(this.partialSentence.trim());
            this.partialSentence = '';
        }
    }

    resetTranscription() {
        this.partialSentence = '';
        this.lockedInterim = '';
        this.interimText = '';
        this.lastLoggedSentence = '';
        this.updateInterimDisplay();
    }

    resetState() {
        this.hasStartedBefore = false;
        this.shouldRestart = false;
        this.lockedInterim = '';
        this.interimText = '';
        this.updateInterimDisplay();
    }

    cleanup() {
        this.stopListening();
        this.clearAllTimers();
        this.audioManager.cleanup();
        console.log('SpeechRecognitionManager cleaned up');
    }
}

// Export for use in other modules
window.SpeechRecognitionManager = SpeechRecognitionManager;