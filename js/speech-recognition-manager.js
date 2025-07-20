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
        this.FORCE_DISPLAY_INTERVAL = 3000; // Force display every 3 seconds for VB Cable
        
        // Timers
        this.silenceTimer = null;
        this.chunkTimer = null;
        this.sentencePauseTimer = null;
        this.periodicTimer = null;
        this.forceDisplayTimer = null;
        
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
            this.onStatusChange?.('error', 'Speech Recognition не поддерживается в этом браузере');
            return false;
        }

        try {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.maxAlternatives = 1;
            this.recognition.lang = 'ru-RU'; // Default language
            
            this.setupEventHandlers();
            console.log('Speech Recognition initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Speech Recognition:', error);
            this.onStatusChange?.('error', 'Ошибка инициализации распознавания речи: ' + error.message);
            return false;
        }
    }

    setupEventHandlers() {
        if (!this.recognition) return;

        this.recognition.onstart = () => {
            console.log('Speech Recognition started successfully');
            this.onStatusChange?.('listening', 'Слушаю...');
            
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
            console.error('Speech recognition error:', event.error, event);
            
            // Handle different types of errors with better user feedback
            switch (event.error) {
                case 'network':
                    this.onStatusChange?.('error', 'Сетевая ошибка - попробую снова');
                    if (this.continuousMode && this.reconnectAttempts < this.maxReconnectAttempts) {
                        setTimeout(() => this.attemptRestart(), this.RECONNECT_DELAY * (this.reconnectAttempts + 1));
                    }
                    break;
                    
                case 'not-allowed':
                    this.onStatusChange?.('error', 'Доступ к микрофону запрещен. Разрешите доступ к микрофону в настройках браузера.');
                    this.continuousMode = false;
                    break;
                    
                case 'service-not-allowed':
                    this.onStatusChange?.('error', 'Сервис распознавания речи недоступен. Попробуйте перезагрузить страницу.');
                    break;
                    
                case 'bad-grammar':
                    this.onStatusChange?.('error', 'Ошибка грамматики распознавания');
                    break;
                    
                case 'language-not-supported':
                    this.onStatusChange?.('error', 'Выбранный язык не поддерживается. Переключаюсь на автоопределение.');
                    if (this.recognition) {
                        this.recognition.lang = '';
                    }
                    break;
                    
                case 'no-speech':
                    console.log('No speech detected, this is normal');
                    // Don't show error for no-speech, it's normal
                    if (this.continuousMode && this.isListening) {
                        this.attemptRestart();
                    }
                    break;
                    
                case 'audio-capture':
                    this.onStatusChange?.('error', 'Ошибка захвата аудио. Проверьте подключение микрофона.');
                    break;
                    
                case 'aborted':
                    // This is normal during restart, don't show as error
                    console.log('Recognition aborted (normal during restart)');
                    break;
                    
                default:
                    this.onStatusChange?.('error', `Ошибка распознавания: ${event.error}`);
                    if (this.continuousMode && this.reconnectAttempts < this.maxReconnectAttempts) {
                        setTimeout(() => this.attemptRestart(), this.RECONNECT_DELAY);
                    }
            }
        };

        this.recognition.onresult = (event) => {
            console.log('Speech recognition result received:', event.results.length, 'results');
            this.handleRecognitionResult(event);
        };

        this.recognition.onnomatch = () => {
            console.log('Speech recognition: no match found');
            this.onStatusChange?.('listening', 'Не удалось распознать речь, продолжаю слушать...');
        };

        this.recognition.onsoundstart = () => {
            console.log('Sound detected');
        };

        this.recognition.onsoundend = () => {
            console.log('Sound ended');
        };

        this.recognition.onspeechstart = () => {
            console.log('Speech started');
        };

        this.recognition.onspeechend = () => {
            console.log('Speech ended');
        };
    }

    handleRecognitionResult(event) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
            this.shouldRestart = true;
            this.recognition.stop();
        }, this.SILENCE_THRESHOLD);

        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcriptPart = result[0].transcript;
            
            console.log(`Result ${i}: isFinal=${result.isFinal}, confidence=${result[0].confidence}, text="${transcriptPart}"`);
            
            if (result.isFinal) {
                if (transcriptPart.trim()) {
                    finalTranscript += transcriptPart.trim();
                    this.partialSentence += (this.partialSentence ? ' ' : '') + transcriptPart.trim();
                    
                    // Показываем финальный результат сразу
                    this.onTranscriptUpdate?.(this.partialSentence, true);
                    
                    // Проверяем на наличие множественных предложений
                    const sentences = this.partialSentence.split(/([.!?]+)/);
                    if (sentences.length > 2) {
                        // Есть завершенные предложения с знаками препинания
                        let completedSentences = '';
                        let remainingText = '';
                        
                        for (let i = 0; i < sentences.length - 1; i += 2) {
                            if (sentences[i].trim() && sentences[i + 1]) {
                                const fullSentence = sentences[i] + sentences[i + 1];
                                this.finalizeSentence(fullSentence.trim());
                            }
                        }
                        
                        // Оставшийся текст
                        this.partialSentence = sentences[sentences.length - 1] || '';
                        clearTimeout(this.sentencePauseTimer);
                    } else if (/[.!?]\s*$/.test(this.partialSentence)) {
                        // Одно предложение с знаком препинания
                        this.finalizeSentence(this.partialSentence);
                        this.partialSentence = '';
                        clearTimeout(this.sentencePauseTimer);
                    } else {
                        // Без знаков препинания, ждем паузу
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
                // Показываем промежуточные результаты для лучшей обратной связи
                if (interimTranscript.trim()) {
                    const fullInterim = this.partialSentence + (this.partialSentence ? ' ' : '') + interimTranscript;
                    this.onTranscriptUpdate?.(fullInterim, false);
                }
            }
        }
        
        this.interimText = interimTranscript;
        
        // Дополнительное отображение для непрерывного потока
        if (this.partialSentence && this.partialSentence.length > 100) {
            // Проверяем на наличие множественных предложений в накопленном тексте
            const potentialSentences = this.partialSentence.split(/([.!?]+)/);
            if (potentialSentences.length > 2) {
                // Есть завершенные предложения, обрабатываем их
                let completedText = '';
                let remainingText = '';
                
                for (let i = 0; i < potentialSentences.length - 1; i += 2) {
                    if (potentialSentences[i].trim() && potentialSentences[i + 1]) {
                        completedText += potentialSentences[i] + potentialSentences[i + 1];
                    }
                }
                
                // Оставшийся текст без знаков препинания
                remainingText = potentialSentences[potentialSentences.length - 1] || '';
                
                if (completedText.trim()) {
                    this.finalizeSentence(completedText.trim());
                    this.partialSentence = remainingText.trim();
                }
            } else {
                // Если накопилось много текста без финализации, показываем чанками
                const chunks = this.partialSentence.match(/.{1,50}(\s|$)/g) || [this.partialSentence];
                if (chunks.length > 1) {
                    const completeChunks = chunks.slice(0, -1);
                    completeChunks.forEach(chunk => {
                        if (chunk.trim()) {
                            this.finalizeSentence(chunk.trim());
                        }
                    });
                    this.partialSentence = chunks[chunks.length - 1] || '';
                }
            }
        }
        
        this.updateInterimDisplay();
        
        if (finalTranscript) {
            console.log('Final transcript received:', finalTranscript);
        }
        if (interimTranscript) {
            console.log('Interim transcript:', interimTranscript);
        }
    }

    async startListening(language = 'ru-RU', continuous = true) {
        if (this.isListening) {
            console.log('Already listening, ignoring start request');
            return false;
        }
        
        if (!this.recognition) {
            console.error('Speech recognition not initialized');
            this.onStatusChange?.('error', 'Распознавание речи не инициализировано');
            return false;
        }

        console.log('Starting speech recognition with language:', language, 'continuous:', continuous);
        
        this.recognition.lang = language;
        this.continuousMode = continuous;
        this.reconnectAttempts = 0;
        
        try {
            // Initialize audio manager without requesting microphone
            await this.audioManager.initializeFromRecognition();
            
            this.isListening = true;
            this.hasStartedBefore = false;
            
            // Check microphone permissions first
            if (navigator.permissions) {
                try {
                    const permission = await navigator.permissions.query({ name: 'microphone' });
                    console.log('Microphone permission status:', permission.state);
                    
                    if (permission.state === 'denied') {
                        this.onStatusChange?.('error', 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.');
                        this.isListening = false;
                        return false;
                    }
                } catch (permError) {
                    console.log('Could not check microphone permissions:', permError);
                }
            }
            
            this.recognition.start();
            
            console.log('Speech recognition start command sent');
            return true;
        } catch (error) {
            console.error('Failed to start listening:', error);
            this.onStatusChange?.('error', 'Не удалось запустить прослушивание: ' + error.message);
            this.isListening = false;
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
        
        // Разбиваем текст на отдельные предложения по знакам препинания
        const sentences = this.splitIntoSentences(sentence);
        
        for (const singleSentence of sentences) {
            const trimmedSentence = singleSentence.trim();
            if (trimmedSentence && trimmedSentence !== this.lastLoggedSentence) {
                this.lastLoggedSentence = trimmedSentence;
                this.onSentenceFinalized?.(trimmedSentence);
                console.log('Finalized sentence:', trimmedSentence);
            }
        }
    }

    splitIntoSentences(text) {
        if (!text || !text.trim()) return [];
        
        // Разделяем по знакам препинания и другим индикаторам конца предложения
        const sentences = text
            .split(/[.!?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
        
        // Если не было знаков препинания, но текст длинный, разбиваем по смысловым паузам
        if (sentences.length === 1 && text.length > 100) {
            const parts = text
                .split(/\s*(?:,\s*и\s*|,\s*а\s*|,\s*но\s*|,\s*или\s*|;\s*|\s+и\s+|\s+а\s+|\s+но\s+|\s+или\s+)\s*/)
                .map(s => s.trim())
                .filter(s => s.length > 10); // Только достаточно длинные части
            
            if (parts.length > 1) {
                return parts;
            }
        }
        
        // Если все еще одно длинное предложение, разбиваем по количеству слов
        if (sentences.length === 1 && text.split(/\s+/).length > 20) {
            const words = text.split(/\s+/);
            const chunks = [];
            
            for (let i = 0; i < words.length; i += 15) {
                const chunk = words.slice(i, i + 15).join(' ');
                if (chunk.trim()) {
                    chunks.push(chunk.trim());
                }
            }
            
            return chunks.length > 1 ? chunks : sentences;
        }
        
        return sentences.length > 0 ? sentences : [text.trim()];
    }

    updateInterimDisplay() {
        const displayText = (this.lockedInterim + ' ' + this.interimText).trim();
        this.onTranscriptUpdate?.(displayText, false);
    }

    startTimers() {
        this.clearAllTimers();
        
        this.chunkTimer = setInterval(() => {
            console.log('Chunk timer triggered');
            if (this.partialSentence) {
                this.finalizeSentence(this.partialSentence);
                this.partialSentence = '';
            }
        }, this.CHUNK_DURATION);

        this.periodicTimer = setInterval(() => {
            console.log('Periodic timer triggered');
            if (this.partialSentence) {
                this.finalizeSentence(this.partialSentence);
                this.partialSentence = '';
            }
        }, this.PERIODIC_THRESHOLD);
        
        // Добавляем таймер для принудительного отображения
        this.forceDisplayTimer = setInterval(() => {
            if (this.partialSentence && this.partialSentence.trim().length > 20) {
                console.log('Force display timer triggered, showing accumulated text:', this.partialSentence);
                this.onTranscriptUpdate?.(this.partialSentence, true);
                this.finalizeSentence(this.partialSentence);
                this.partialSentence = '';
            }
        }, this.FORCE_DISPLAY_INTERVAL);
    }

    clearAllTimers() {
        console.log('Clearing all timers');
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        if (this.chunkTimer) {
            clearInterval(this.chunkTimer);
            this.chunkTimer = null;
        }
        if (this.sentencePauseTimer) {
            clearTimeout(this.sentencePauseTimer);
            this.sentencePauseTimer = null;
        }
        if (this.periodicTimer) {
            clearInterval(this.periodicTimer);
            this.periodicTimer = null;
        }
        if (this.forceDisplayTimer) {
            clearInterval(this.forceDisplayTimer);
            this.forceDisplayTimer = null;
        }
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