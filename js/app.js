/**
 * Main Application class that coordinates all components
 * and manages the overall application state
 */
class App {
    constructor() {
        this.audioManager = new AudioManager();
        this.speechManager = new SpeechRecognitionManager(this.audioManager);
        this.aiService = new AIService();
        this.conversationManager = new ConversationManager();
        this.uiManager = new UIManager();
        
        // UI Elements
        this.initializeUIElements();
        
        // Application state
        this.conversationHistory = [];
        this.rawConversationBuffer = [];
        this.analysisQueue = [];
        this.lastProcessedQuestions = [];
        this.questionContext = '';
        this.aiResponses = [];
        this.sessionStartTime = null;
        this.responseIdCounter = 0;
        
        // Teleprompter communication channel
        this.teleprompterChannel = new BroadcastChannel('teleprompter_channel');
        
        // Initialize the application
        this.initialize();
    }

    initializeUIElements() {
        // Buttons
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.settingsButton = document.getElementById('settings-button');
        this.teleprompterBtn = document.getElementById('teleprompter-btn');
        this.saveConversationBtn = document.getElementById('save-conversation-btn');
        this.clearSessionBtn = document.getElementById('clear-session-btn');
        
        // Status indicators
        this.statusLight = document.getElementById('status-light');
        this.statusText = document.getElementById('status-text');
        this.currentSpeakerDiv = document.getElementById('current-speaker');
        
        // Controls
        this.languageSelect = document.getElementById('language');
        
        // Display areas
        this.interimTranscriptDiv = document.getElementById('interim-transcript');
        this.finalTranscriptDiv = document.getElementById('final-transcript');
        this.aiResponseArea = document.getElementById('ai-response-area');
        this.aiPlaceholder = document.getElementById('ai-placeholder');
        this.progressBar = document.getElementById('progress-bar');
        
        // Settings modal
        this.settingsModal = document.getElementById('settings-modal');
        this.modalApiKeyInput = document.getElementById('modal-apiKey-input');
        this.modalTopicInput = document.getElementById('modal-topic-input');
        this.modalSaveButton = document.getElementById('modal-save-button');
        this.modalCancelButton = document.getElementById('modal-cancel-button');
    }

    initialize() {
        this.setupEventHandlers();
        this.setupSpeechCallbacks();
        this.loadSettings();
        this.updateButtonStates();
        
        // Show browser compatibility warning if needed
        this.uiManager.showBrowserCompatibilityWarning();
        
        console.log('Application initialized successfully');
    }

    setupEventHandlers() {
        // Start/Stop buttons
        this.startButton.addEventListener('click', () => this.handleStart());
        this.stopButton.addEventListener('click', () => this.handleStop());
        
        // Settings
        this.settingsButton.addEventListener('click', () => this.showSettings());
        this.modalSaveButton.addEventListener('click', () => this.saveSettings());
        this.modalCancelButton.addEventListener('click', () => this.hideSettings());
        
        // Teleprompter
        this.teleprompterBtn.addEventListener('click', () => this.openTeleprompter());
        
        // Conversation management
        this.saveConversationBtn.addEventListener('click', () => this.saveConversation());
        this.clearSessionBtn.addEventListener('click', () => this.clearSession());
        
        // Settings modal click outside to close
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.hideSettings();
            }
        });
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => this.cleanup());
        
        // Handle page visibility changes
        window.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    }

    setupSpeechCallbacks() {
        // Set up callbacks for speech recognition events
        this.speechManager.onStatusChange = (status, message) => {
            this.updateStatus(status, message);
        };
        
        this.speechManager.onTranscriptUpdate = (text, isFinal) => {
            this.updateTranscriptDisplay(text, isFinal);
        };
        
        this.speechManager.onSentenceFinalized = (sentence) => {
            this.handleSentenceFinalized(sentence);
        };
    }

    loadSettings() {
        // Load settings from localStorage
        const apiKey = localStorage.getItem('openai_api_key') || '';
        const topic = localStorage.getItem('conversation_topic') || '';
        
        this.modalApiKeyInput.value = apiKey;
        this.modalTopicInput.value = topic;
        
        this.aiService.setApiKey(apiKey);
        this.aiService.setConversationTopic(topic);
        
        // Check for session backup
        this.checkSessionBackup();
    }

    checkSessionBackup() {
        const backup = this.conversationManager.getSessionBackup();
        if (backup && backup.lastSaved && (Date.now() - backup.lastSaved < 24 * 60 * 60 * 1000)) {
            // Backup is less than 24 hours old
            this.uiManager.showToast(
                'Previous session backup found. Click to restore.', 
                'info', 
                10000
            );
            
            // You could add a restore button here if needed
            setTimeout(() => {
                if (confirm('Restore previous session?')) {
                    this.restoreSession(backup);
                }
            }, 2000);
        }
    }

    restoreSession(backup) {
        if (backup.transcript) {
            this.rawConversationBuffer = backup.transcript;
            backup.transcript.forEach(entry => {
                this.addToTranscriptDisplay(entry.text || entry);
            });
        }
        
        if (backup.aiResponses) {
            this.aiResponses = backup.aiResponses;
            backup.aiResponses.forEach(response => {
                this.displayRestoredAIResponse(response);
            });
        }
        
        this.uiManager.showSuccessMessage('Session restored successfully!');
        this.conversationManager.clearSessionBackup();
    }

    async handleStart() {
        if (this.speechManager.isListening) return;

        try {
            // Mark session start time
            if (!this.sessionStartTime) {
                this.sessionStartTime = Date.now();
            }
            
            // Update UI to show connecting state
            this.updateStatus('connecting', 'Connecting to API...');
            
            // Test API connection first
            await this.aiService.testConnection();
            this.updateStatus('connected', 'Connected to API');
            
            // Get selected language
            const selectedLang = this.languageSelect.value;
            const language = selectedLang === 'auto' ? 'ru-RU' : selectedLang;
            
            // Start speech recognition
            const success = await this.speechManager.startListening(language);
            
            if (success) {
                this.updateButtonStates(true);
                this.clearDisplays();
            } else {
                this.updateStatus('error', 'Failed to start listening');
            }
            
        } catch (error) {
            console.error('Failed to start:', error);
            this.updateStatus('error', 'API connection failed');
        }
    }

    handleStop() {
        if (!this.speechManager.isListening) return;
        
        this.speechManager.stopListening();
        this.updateButtonStates(false);
    }

    updateStatus(status, message) {
        this.statusText.textContent = message;
        
        const statusClasses = {
            'stopped': 'w-3 h-3 rounded-full bg-red-500',
            'connecting': 'w-3 h-3 rounded-full bg-yellow-500 pulse',
            'connected': 'w-3 h-3 rounded-full bg-blue-500',
            'listening': 'w-3 h-3 rounded-full bg-green-500 pulse',
            'error': 'w-3 h-3 rounded-full bg-red-500'
        };
        
        this.statusLight.className = statusClasses[status] || statusClasses['stopped'];
    }

    updateButtonStates(isListening = false) {
        this.startButton.disabled = isListening;
        this.stopButton.disabled = !isListening;
        this.languageSelect.disabled = isListening;
    }

    updateTranscriptDisplay(text, isFinal) {
        if (isFinal) {
            // Handle final transcript
            this.interimTranscriptDiv.textContent = '...';
        } else {
            // Handle interim transcript
            this.interimTranscriptDiv.textContent = text || '...';
        }
    }

    async handleSentenceFinalized(sentence) {
        // Add to conversation buffer
        this.rawConversationBuffer.push(sentence);
        
        // Update display
        this.addToTranscriptDisplay(sentence);
        
        // Update speaker status
        this.currentSpeakerDiv.textContent = 'Recording...';
        
        // Process for questions
        await this.processForQuestions(sentence);
    }

    addToTranscriptDisplay(sentence) {
        const sentenceDiv = document.createElement('div');
        sentenceDiv.className = 'p-2 border-l-4 border-blue-500 bg-gray-800/50 rounded-r';
        sentenceDiv.textContent = sentence;
        this.finalTranscriptDiv.appendChild(sentenceDiv);
        
        // Add animation
        this.uiManager.animateTranscriptEntry(sentenceDiv);
        
        // Auto-scroll to bottom
        this.finalTranscriptDiv.scrollTop = this.finalTranscriptDiv.scrollHeight;
        
        // Auto-save session backup
        this.saveSessionBackup();
    }

    async processForQuestions(sentence) {
        try {
            // Create context from recent conversation
            const contextSentences = this.rawConversationBuffer.slice(-5);
            const context = contextSentences.join(' ');
            
            // Analyze for questions
            const analysis = await this.aiService.processTextAnalysis(sentence, context);
            
            if (analysis && analysis.questions.length > 0) {
                await this.handleQuestionsDetected(analysis, context);
            }
            
        } catch (error) {
            console.error('Question processing failed:', error);
        }
    }

    async handleQuestionsDetected(analysis, context) {
        const { questions, priority } = analysis;
        
        if (priority.main_question) {
            await this.generateAndDisplayResponse(priority.main_question, context);
        }
        
        // Display all detected questions for reference
        this.displayDetectedQuestions(questions);
    }

    async generateAndDisplayResponse(question, context, isRegeneration = false, existingResponseId = null) {
        try {
            this.showProgress(true);
            
            // Show queue indicator if there are pending requests
            if (this.analysisQueue.length > 0) {
                this.uiManager.showQueueIndicator(this.analysisQueue.length);
            }
            
            const response = await this.aiService.generateResponse(
                question, 
                context, 
                this.aiService.conversationTopic
            );
            
            if (isRegeneration && existingResponseId) {
                this.updateExistingResponse(existingResponseId, question, response);
            } else {
                this.displayAIResponse(question, response);
            }
            
        } catch (error) {
            console.error('Response generation failed:', error);
            
            // Check if it's an API key configuration error
            if (error.message.includes('API key not configured')) {
                this.uiManager.showApiKeySetupInstructions();
            } else {
                this.uiManager.showErrorMessage('Failed to generate response: ' + error.message);
            }
        } finally {
            this.showProgress(false);
            this.uiManager.hideQueueIndicator();
        }
    }

    displayDetectedQuestions(questions) {
        questions.forEach(question => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'mb-2 p-2 bg-gray-700 rounded flex items-center';
            
            const tagClass = this.aiService.getTagClassForCategory(question.category);
            questionDiv.innerHTML = `
                <span class="q-tag ${tagClass}">${question.category}</span>
                <span class="text-gray-200">${question.text}</span>
            `;
            
            this.aiResponseArea.appendChild(questionDiv);
        });
        
        // Auto-scroll
        this.aiResponseArea.scrollTop = this.aiResponseArea.scrollHeight;
    }

    displayAIResponse(question, response) {
        // Hide placeholder if visible
        if (this.aiPlaceholder && this.aiPlaceholder.parentNode) {
            this.aiPlaceholder.remove();
        }
        
        // Generate unique response ID
        const responseId = ++this.responseIdCounter;
        
        // Create response using UI manager
        const { container, regenerateBtn, responseEl } = this.uiManager.createResponseContainer(
            question, 
            this.formatResponse(response), 
            responseId
        );
        
        // Store response data
        const responseData = {
            id: responseId,
            question,
            response,
            timestamp: Date.now(),
            context: this.questionContext
        };
        this.aiResponses.push(responseData);
        
        // Set up regenerate button click handler
        regenerateBtn.addEventListener('click', () => {
            this.regenerateResponse(responseId, question, this.questionContext);
        });
        
        // Add to display area
        this.aiResponseArea.appendChild(container);
        
        // Render math and code
        this.renderMathAndCode(responseEl);
        
        // Auto-scroll with smooth animation
        this.uiManager.smoothScrollTo(container);
        
        // Send response to teleprompter window
        this.sendToTeleprompter(response);
        
        // Save session backup
        this.saveSessionBackup();
    }
    
    displayRestoredAIResponse(responseData) {
        // Hide placeholder if visible
        if (this.aiPlaceholder && this.aiPlaceholder.parentNode) {
            this.aiPlaceholder.remove();
        }
        
        const { container, regenerateBtn, responseEl } = this.uiManager.createResponseContainer(
            responseData.question, 
            this.formatResponse(responseData.response), 
            responseData.id
        );
        
        // Set up regenerate button click handler
        regenerateBtn.addEventListener('click', () => {
            this.regenerateResponse(responseData.id, responseData.question, responseData.context);
        });
        
        this.aiResponseArea.appendChild(container);
        this.renderMathAndCode(responseEl);
    }

    async regenerateResponse(responseId, question, context) {
        this.uiManager.showInfoMessage('Regenerating response...');
        await this.generateAndDisplayResponse(question, context, true, responseId);
    }

    updateExistingResponse(responseId, question, newResponse) {
        // Find the response container
        const container = document.querySelector(`[data-response-id="${responseId}"]`);
        if (!container) return;
        
        // Update the response content
        const responseEl = container.querySelector('.ai-response-content');
        responseEl.innerHTML = this.formatResponse(newResponse);
        
        // Re-render math and code
        this.renderMathAndCode(responseEl);
        
        // Update stored data
        const responseData = this.aiResponses.find(r => r.id === responseId);
        if (responseData) {
            responseData.response = newResponse;
            responseData.timestamp = Date.now();
        }
        
        // Add flash effect to show update
        container.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
        setTimeout(() => {
            container.style.backgroundColor = '';
        }, 1000);
        
        this.uiManager.showSuccessMessage('Response regenerated!');
        this.saveSessionBackup();
    }

    formatResponse(text) {
        // Basic markdown-like formatting
        return text
            .replace(/```([\s\S]*?)```/g, '<pre><code class="hljs">$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    renderMathAndCode(element) {
        // Render math expressions
        if (window.renderMathInElement) {
            try {
                window.renderMathInElement(element, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\[', right: '\\]', display: true},
                        {left: '\\(', right: '\\)', display: false}
                    ]
                });
            } catch (error) {
                console.warn('Math rendering failed:', error);
            }
        }
        
        // Highlight code
        if (window.hljs) {
            element.querySelectorAll('pre code').forEach(block => {
                window.hljs.highlightElement(block);
            });
        }
    }

    displayError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'mb-4 p-4 bg-red-900/50 border border-red-600 rounded-lg text-red-200';
        errorDiv.textContent = message;
        this.aiResponseArea.appendChild(errorDiv);
    }

    showProgress(show) {
        this.progressBar.style.display = show ? 'block' : 'none';
    }

    clearDisplays() {
        this.finalTranscriptDiv.innerHTML = '';
        this.aiResponseArea.innerHTML = '';
        if (this.aiPlaceholder) {
            this.aiResponseArea.appendChild(this.aiPlaceholder);
        }
        this.rawConversationBuffer = [];
        this.analysisQueue.length = 0;
        this.conversationHistory = [];
        this.lastProcessedQuestions = [];
        this.questionContext = '';
    }

    showSettings() {
        this.settingsModal.classList.remove('hidden');
        this.settingsModal.classList.add('flex');
    }

    hideSettings() {
        this.settingsModal.classList.add('hidden');
        this.settingsModal.classList.remove('flex');
    }

    saveSettings() {
        const apiKey = this.modalApiKeyInput.value.trim();
        const topic = this.modalTopicInput.value.trim();
        
        this.aiService.setApiKey(apiKey);
        this.aiService.setConversationTopic(topic);
        
        this.hideSettings();
        console.log('Settings saved');
    }

    handleVisibilityChange() {
        if (document.hidden && !this.speechManager.isListening) {
            console.log('Page hidden, keeping resources for quick restart');
            this.saveSessionBackup();
        }
    }

    saveSessionBackup() {
        if (this.rawConversationBuffer.length === 0 && this.aiResponses.length === 0) {
            return; // Nothing to save
        }
        
        const sessionData = {
            transcript: this.rawConversationBuffer.map(text => ({ text, timestamp: Date.now() })),
            aiResponses: this.aiResponses,
            questions: this.lastProcessedQuestions,
            topic: this.aiService.conversationTopic,
            language: this.languageSelect.value,
            sessionStartTime: this.sessionStartTime
        };
        
        this.conversationManager.saveSessionBackup(sessionData);
    }

    async saveConversation() {
        try {
            if (this.rawConversationBuffer.length === 0 && this.aiResponses.length === 0) {
                this.uiManager.showInfoMessage('No conversation to save');
                return;
            }
            
            const duration = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
            
            const conversationData = {
                transcript: this.rawConversationBuffer.map(text => ({ text, timestamp: Date.now() })),
                aiResponses: this.aiResponses,
                questions: this.lastProcessedQuestions,
                topic: this.aiService.conversationTopic,
                language: this.languageSelect.value,
                duration
            };
            
            const savedConversation = await this.conversationManager.saveConversation(conversationData);
            this.uiManager.showSuccessMessage(`Conversation saved: ${savedConversation.title}`);
            
            // Clear session backup since we've saved permanently
            this.conversationManager.clearSessionBackup();
            
        } catch (error) {
            console.error('Failed to save conversation:', error);
            this.uiManager.showErrorMessage('Failed to save conversation');
        }
    }

    async clearSession() {
        if (confirm('Clear current session? This will remove all transcript and AI responses.')) {
            // Clear UI
            this.finalTranscriptDiv.innerHTML = '';
            this.aiResponseArea.innerHTML = '';
            this.aiResponseArea.appendChild(this.aiPlaceholder);
            this.interimTranscriptDiv.textContent = '...';
            
            // Reset state
            this.rawConversationBuffer = [];
            this.aiResponses = [];
            this.analysisQueue = [];
            this.lastProcessedQuestions = [];
            this.questionContext = '';
            this.sessionStartTime = null;
            this.responseIdCounter = 0;
            
            // Clear backup
            this.conversationManager.clearSessionBackup();
            
            this.uiManager.showSuccessMessage('Session cleared');
        }
    }

    cleanup() {
        this.saveSessionBackup();
        this.speechManager.cleanup();
        this.audioManager.cleanup();
        if (this.teleprompterChannel) {
            this.teleprompterChannel.close();
        }
        console.log('Application cleaned up');
    }

    sendToTeleprompter(response) {
        try {
            if (!this.teleprompterChannel) {
                console.warn('Teleprompter channel not available');
                return;
            }

            // Start teleprompter display
            this.teleprompterChannel.postMessage({ type: 'start' });
            
            // Add a small delay for Safari compatibility
            setTimeout(() => {
                try {
                    // Send the response content
                    this.teleprompterChannel.postMessage({ 
                        type: 'token', 
                        data: response 
                    });
                    
                    // Add another small delay before ending
                    setTimeout(() => {
                        try {
                            // End teleprompter display
                            this.teleprompterChannel.postMessage({ type: 'end' });
                            console.log('Response sent to teleprompter successfully');
                        } catch (endError) {
                            console.error('Failed to send end message to teleprompter:', endError);
                        }
                    }, 100);
                    
                } catch (contentError) {
                    console.error('Failed to send content to teleprompter:', contentError);
                }
            }, 100);
            
        } catch (error) {
            console.error('Failed to send response to teleprompter:', error);
        }
    }

    openTeleprompter() {
        try {
            const teleprompterWindow = window.open(
                'teleprompter.html', 
                'teleprompter', 
                'width=800,height=600,scrollbars=no,resizable=yes,status=no,location=no,toolbar=no,menubar=no'
            );
            
            if (!teleprompterWindow) {
                throw new Error('Failed to open teleprompter window. Please allow popups for this site.');
            }
            
            console.log('Teleprompter window opened successfully');
            this.uiManager.showSuccessMessage('Teleprompter window opened!');
        } catch (error) {
            console.error('Failed to open teleprompter window:', error);
            this.uiManager.showErrorMessage('Failed to open teleprompter: ' + error.message);
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});