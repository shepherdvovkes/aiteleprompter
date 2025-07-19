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
        this.recentQuestions = []; // Store recent questions for follow-up detection
        this.questionContext = '';
        this.aiResponses = [];
        this.sessionStartTime = null;
        this.responseIdCounter = 0;
        
        // Question processing delay management
        this.questionProcessingDelay = 3000; // 3 seconds delay after last sentence
        this.questionProcessingTimer = null;
        this.countdownInterval = null;
        this.pendingSentences = []; // Buffer for sentences waiting to be processed
        this.maxSentenceBuffer = 5; // Maximum sentences to buffer
        this.lastSentenceTime = null;
        
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
        this.modalDelayInput = document.getElementById('modal-delay-input');
        this.demoModeCheckbox = document.getElementById('demo-mode-checkbox');
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
        const delay = localStorage.getItem('question_processing_delay') || '3';
        const demoMode = localStorage.getItem('demo_mode') === 'true';
        
        this.modalApiKeyInput.value = apiKey;
        this.modalTopicInput.value = topic;
        this.modalDelayInput.value = delay;
        this.demoModeCheckbox.checked = demoMode;
        
        this.aiService.setApiKey(apiKey);
        this.aiService.setConversationTopic(topic);
        this.questionProcessingDelay = parseFloat(delay) * 1000; // Convert to milliseconds
        
        // Set demo mode
        if (demoMode) {
            window.demoMode.enable();
        }
        
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
            
            // Start speech recognition in continuous mode
            const success = await this.speechManager.startListening(language, true);
            
            if (success) {
                this.updateButtonStates(true);
                this.clearDisplays();
                
                // Show continuous mode indicator
                this.showContinuousModeIndicator();
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
        
        // Hide continuous mode indicator
        this.hideContinuousModeIndicator();
        this.hidePendingQuestionsIndicator();
        
        // Process any remaining pending questions before stopping
        if (this.pendingSentences.length > 0) {
            console.log('Processing remaining pending questions before stop');
            clearTimeout(this.questionProcessingTimer);
            this.processDelayedQuestions();
        }
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
        
        // Add to pending sentences buffer
        this.pendingSentences.push({
            text: sentence,
            timestamp: Date.now()
        });
        
        // Keep buffer size manageable
        if (this.pendingSentences.length > this.maxSentenceBuffer) {
            this.pendingSentences.shift();
        }
        
        this.lastSentenceTime = Date.now();
        
        // Clear existing timer and set new one for delayed processing
        if (this.questionProcessingTimer) {
            clearTimeout(this.questionProcessingTimer);
        }
        
        this.questionProcessingTimer = setTimeout(() => {
            this.processDelayedQuestions();
        }, this.questionProcessingDelay);
        
        // Start countdown timer for the indicator
        this.startCountdownTimer();
        
        // Also do immediate check for urgent/complete questions
        const processedImmediately = await this.checkForImmediateQuestions(sentence);
        
        // Show pending indicator if we have buffered sentences waiting for processing
        if (this.pendingSentences.length > 0 && !processedImmediately) {
            this.showPendingQuestionsIndicator();
        }
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

    async checkForImmediateQuestions(sentence) {
        try {
            const trimmedSentence = sentence.trim();
            
            // Check for complete questions with punctuation
            const hasQuestionPunctuation = /[?!]\s*$/.test(trimmedSentence);
            
            // Question word patterns (English and Russian)
            const questionWords = /^(что|как|где|когда|почему|зачем|кто|какой|какая|какое|какие|which|what|how|where|when|why|who|whose|whom)/i;
            const auxiliaryQuestions = /^(can|could|would|should|will|do|does|did|is|are|was|were|have|has|had)/i;
            
            // Check for complete questions
            const isCompleteQuestion = hasQuestionPunctuation && 
                                     (questionWords.test(trimmedSentence) || auxiliaryQuestions.test(trimmedSentence));
            
            // Check for obvious standalone questions even without punctuation
            const isStandaloneQuestion = !hasQuestionPunctuation && questionWords.test(trimmedSentence) && 
                                       trimmedSentence.split(' ').length >= 3; // At least 3 words
            
            // Check for short potential continuation indicators
            const isContinuationIndicator = /^(и|а|но|также|плюс|ещё|еще|кроме того|and|also|plus|additionally|furthermore|moreover)\s/i.test(trimmedSentence);
            
            if (isCompleteQuestion || isStandaloneQuestion) {
                console.log('Detected immediate question, processing now:', trimmedSentence);
                const contextSentences = this.rawConversationBuffer.slice(-3);
                const context = contextSentences.join(' ');
                
                const analysis = await this.aiService.processTextAnalysis(sentence, context);
                
                if (analysis && analysis.questions.length > 0) {
                    // Remove this sentence from pending buffer since we're processing it now
                    this.pendingSentences = this.pendingSentences.filter(s => s.text !== sentence);
                    
                    // Mark questions as immediate and handle them
                    analysis.questions.forEach(q => q.questionType = 'immediate');
                    await this.handleQuestionsDetected(analysis, context, 'immediate');
                    return true; // Indicate that we processed this immediately
                }
            } else if (isContinuationIndicator && this.pendingSentences.length > 0) {
                // This might be a continuation, extend the delay slightly
                console.log('Detected potential continuation word, extending delay');
                if (this.questionProcessingTimer) {
                    clearTimeout(this.questionProcessingTimer);
                    this.questionProcessingTimer = setTimeout(() => {
                        this.processDelayedQuestions();
                    }, this.questionProcessingDelay + 1500); // Add extra 1.5 seconds for continuations
                    
                    // Restart countdown with extended time
                    this.startCountdownTimer(this.questionProcessingDelay + 1500);
                }
            }
            
            return false; // Not processed immediately
        } catch (error) {
            console.error('Immediate question check failed:', error);
            return false;
        }
    }

    async processDelayedQuestions() {
        if (this.pendingSentences.length === 0) {
            return;
        }

        try {
            console.log('Processing delayed questions for', this.pendingSentences.length, 'sentences');
            
            // Combine all pending sentences into a text block
            const textBlock = this.pendingSentences.map(s => s.text).join(' ');
            
            // Create extended context from recent conversation
            const contextSentences = this.rawConversationBuffer.slice(-8);
            const context = contextSentences.join(' ');
            
            // First, check for follow-up questions related to recent questions
            const followUpAnalysis = await this.aiService.detectFollowUpQuestions(
                textBlock, 
                context, 
                this.recentQuestions.slice(-5) // Last 5 questions for context
            );
            
            // Process follow-up questions with high priority
            if (followUpAnalysis.has_follow_up && followUpAnalysis.follow_up_questions.length > 0) {
                console.log('Found follow-up questions:', followUpAnalysis.follow_up_questions);
                
                for (const followUpQ of followUpAnalysis.follow_up_questions) {
                    if (followUpQ.priority === 'high') {
                        // Generate response immediately for high-priority follow-ups
                        await this.generateAndDisplayResponse(
                            `${followUpQ.text} (Follow-up to: "${followUpQ.relates_to}")`, 
                            context, 
                            false, 
                            null, 
                            'follow-up'
                        );
                    }
                }
            }
            
            // Then analyze for regular questions
            const analysis = await this.aiService.performSemanticAnalysis(textBlock, context);
            
            if (analysis && analysis.questions && analysis.questions.length > 0) {
                // Store questions for future follow-up detection
                analysis.questions.forEach(q => {
                    this.recentQuestions.push({
                        text: q.text,
                        category: q.category || 'Unknown',
                        timestamp: Date.now()
                    });
                });
                
                // Keep only recent questions (last 10)
                if (this.recentQuestions.length > 10) {
                    this.recentQuestions = this.recentQuestions.slice(-10);
                }
                
                // Use enhanced question prioritization for delayed processing
                const priority = await this.aiService.prioritizeQuestions(context, analysis.questions);
                
                if (priority.main_question) {
                    console.log('Found delayed question:', priority.main_question);
                    await this.handleQuestionsDetected({ 
                        questions: analysis.questions, 
                        priority: priority 
                    }, context);
                }
            }
            
            // Clear pending sentences after processing
            this.pendingSentences = [];
            
        } catch (error) {
            console.error('Delayed question processing failed:', error);
            // Clear pending sentences even on error to prevent buildup
            this.pendingSentences = [];
        } finally {
            // Hide pending indicator
            this.hidePendingQuestionsIndicator();
        }
    }

    showPendingQuestionsIndicator() {
        // Update status to show we're waiting for question completion
        this.currentSpeakerDiv.textContent = `Waiting for question completion... (${this.pendingSentences.length} sentence${this.pendingSentences.length !== 1 ? 's' : ''})`;
        this.currentSpeakerDiv.classList.add('text-yellow-400');
        
        // Show in AI response area
        if (!document.getElementById('pending-questions-indicator')) {
            const indicator = document.createElement('div');
            indicator.id = 'pending-questions-indicator';
            indicator.className = 'bg-yellow-900/30 border border-yellow-600 rounded-lg p-3 mb-4 text-yellow-200';
            indicator.innerHTML = `
                <div class="flex items-center">
                    <svg class="animate-pulse h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                    </svg>
                    <span>Collecting question parts... Will process in ${this.questionProcessingDelay / 1000}s</span>
                </div>
            `;
            
            this.aiResponseArea.insertBefore(indicator, this.aiResponseArea.firstChild);
        }
    }

    hidePendingQuestionsIndicator() {
        // Reset status
        this.currentSpeakerDiv.textContent = 'Recording...';
        this.currentSpeakerDiv.classList.remove('text-yellow-400');
        
        // Remove indicator from AI response area
        const indicator = document.getElementById('pending-questions-indicator');
        if (indicator) {
            indicator.remove();
        }
        
        // Clear countdown timer
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }

    showContinuousModeIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'continuous-mode-indicator';
        indicator.className = 'bg-green-900/30 border border-green-600 rounded-lg p-3 mb-4 text-green-200';
        indicator.innerHTML = `
            <div class="flex items-center">
                <svg class="animate-pulse h-4 w-4 mr-2 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clip-rule="evenodd"/>
                </svg>
                <span>Continuous listening mode active - No questions will be missed!</span>
            </div>
        `;
        
        this.aiResponseArea.insertBefore(indicator, this.aiResponseArea.firstChild);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (indicator && indicator.parentNode) {
                indicator.remove();
            }
        }, 5000);
    }

    hideContinuousModeIndicator() {
        const indicator = document.getElementById('continuous-mode-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    startCountdownTimer(extendedDelay = null) {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        
        const startTime = Date.now();
        const delay = extendedDelay || this.questionProcessingDelay;
        const endTime = startTime + delay;
        
        this.countdownInterval = setInterval(() => {
            const remaining = Math.max(0, endTime - Date.now());
            const seconds = (remaining / 1000).toFixed(1);
            
            const indicator = document.getElementById('pending-questions-indicator');
            if (indicator) {
                const span = indicator.querySelector('span');
                if (span) {
                    span.textContent = `Collecting question parts... Will process in ${seconds}s`;
                }
            }
            
            if (remaining <= 0) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }
        }, 100); // Update every 100ms for smooth countdown
    }

    async handleQuestionsDetected(analysis, context, questionType = 'regular') {
        const { questions, priority } = analysis;
        
        if (priority.main_question) {
            await this.generateAndDisplayResponse(priority.main_question, context, false, null, questionType);
        }
        
        // Display all detected questions for reference
        this.displayDetectedQuestions(questions);
    }

    async generateAndDisplayResponse(question, context, isRegeneration = false, existingResponseId = null, questionType = 'regular') {
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
                this.displayAIResponse(question, response, questionType);
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

    displayAIResponse(question, response, questionType = 'regular') {
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
            responseId,
            questionType
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
        const delay = this.modalDelayInput.value.trim();
        const demoMode = this.demoModeCheckbox.checked;
        
        // Validate delay value
        const delayFloat = parseFloat(delay);
        if (isNaN(delayFloat) || delayFloat < 1 || delayFloat > 10) {
            this.uiManager.showErrorMessage('Question processing delay must be between 1 and 10 seconds');
            return;
        }
        
        this.aiService.setApiKey(apiKey);
        this.aiService.setConversationTopic(topic);
        this.questionProcessingDelay = delayFloat * 1000; // Convert to milliseconds
        
        // Save to localStorage
        localStorage.setItem('question_processing_delay', delay);
        localStorage.setItem('demo_mode', demoMode.toString());
        
        // Update demo mode
        if (demoMode) {
            window.demoMode.enable();
        } else {
            window.demoMode.disable();
        }
        
        this.hideSettings();
        console.log('Settings saved, delay set to:', delayFloat, 'seconds', 'demo mode:', demoMode);
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