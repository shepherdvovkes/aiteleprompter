/**
 * Main Application class that coordinates all components
 * and manages the overall application state
 */
class App {
    constructor() {
        this.audioManager = new AudioManager();
        this.speechManager = new SpeechRecognitionManager(this.audioManager);
        this.aiService = new AIService();
        
        // UI Elements
        this.initializeUIElements();
        
        // Application state
        this.conversationHistory = [];
        this.rawConversationBuffer = [];
        this.analysisQueue = [];
        this.lastProcessedQuestions = [];
        this.questionContext = '';
        
        // Initialize the application
        this.initialize();
    }

    initializeUIElements() {
        // Buttons
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.settingsButton = document.getElementById('settings-button');
        
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
    }

    async handleStart() {
        if (this.speechManager.isListening) return;

        try {
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
        
        // Auto-scroll to bottom
        this.finalTranscriptDiv.scrollTop = this.finalTranscriptDiv.scrollHeight;
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

    async generateAndDisplayResponse(question, context) {
        try {
            this.showProgress(true);
            
            const response = await this.aiService.generateResponse(
                question, 
                context, 
                this.aiService.conversationTopic
            );
            
            this.displayAIResponse(question, response);
            
        } catch (error) {
            console.error('Response generation failed:', error);
            this.displayError('Failed to generate response');
        } finally {
            this.showProgress(false);
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
        
        // Create response container
        const responseDiv = document.createElement('div');
        responseDiv.className = 'mb-4 p-4 bg-gray-700 rounded-lg';
        
        // Question header
        const questionHeader = document.createElement('div');
        questionHeader.className = 'font-semibold text-blue-300 mb-2';
        questionHeader.textContent = `Q: ${question}`;
        
        // Response content
        const responseContent = document.createElement('div');
        responseContent.className = 'ai-response-content text-gray-200';
        responseContent.innerHTML = this.formatResponse(response);
        
        responseDiv.appendChild(questionHeader);
        responseDiv.appendChild(responseContent);
        this.aiResponseArea.appendChild(responseDiv);
        
        // Render math and code
        this.renderMathAndCode(responseContent);
        
        // Auto-scroll
        this.aiResponseArea.scrollTop = this.aiResponseArea.scrollHeight;
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
        }
    }

    cleanup() {
        this.speechManager.cleanup();
        this.audioManager.cleanup();
        console.log('Application cleaned up');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});