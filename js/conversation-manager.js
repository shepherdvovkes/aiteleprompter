/**
 * ConversationManager handles saving and loading of full conversation sessions
 * Uses IndexedDB for better performance and larger storage capacity
 */
class ConversationManager {
    constructor() {
        this.dbName = 'AITeleprompterDB';
        this.dbVersion = 1;
        this.storeName = 'conversations';
        this.db = null;
        this.initializeDB();
    }

    async initializeDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('Error opening IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create conversations store
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    
                    // Create indexes for better querying
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('topic', 'topic', { unique: false });
                }
            };
        });
    }

    async saveConversation(conversationData) {
        if (!this.db) {
            await this.initializeDB();
        }

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        const conversation = {
            timestamp: Date.now(),
            title: this.generateConversationTitle(conversationData),
            topic: conversationData.topic || '',
            transcript: conversationData.transcript || [],
            aiResponses: conversationData.aiResponses || [],
            questions: conversationData.questions || [],
            metadata: {
                duration: conversationData.duration || 0,
                questionCount: (conversationData.questions || []).length,
                responseCount: (conversationData.aiResponses || []).length,
                language: conversationData.language || 'auto'
            }
        };

        return new Promise((resolve, reject) => {
            const request = store.add(conversation);
            
            request.onsuccess = () => {
                const conversationId = request.result;
                conversation.id = conversationId;
                console.log('Conversation saved with ID:', conversationId);
                resolve(conversation);
            };
            
            request.onerror = () => {
                console.error('Error saving conversation:', request.error);
                reject(request.error);
            };
        });
    }

    async getConversations(limit = 50, offset = 0) {
        if (!this.db) {
            await this.initializeDB();
        }

        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('timestamp');

        return new Promise((resolve, reject) => {
            const conversations = [];
            let count = 0;
            let skipped = 0;

            const request = index.openCursor(null, 'prev'); // Most recent first

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                
                if (!cursor || count >= limit) {
                    resolve(conversations);
                    return;
                }

                if (skipped < offset) {
                    skipped++;
                    cursor.continue();
                    return;
                }

                conversations.push(cursor.value);
                count++;
                cursor.continue();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getConversationById(id) {
        if (!this.db) {
            await this.initializeDB();
        }

        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const request = store.get(id);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async deleteConversation(id) {
        if (!this.db) {
            await this.initializeDB();
        }

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            
            request.onsuccess = () => {
                console.log('Conversation deleted:', id);
                resolve();
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async searchConversations(query) {
        const conversations = await this.getConversations(100); // Get more for searching
        
        const searchTerm = query.toLowerCase();
        return conversations.filter(conv => {
            const titleMatch = conv.title.toLowerCase().includes(searchTerm);
            const topicMatch = conv.topic.toLowerCase().includes(searchTerm);
            const transcriptMatch = conv.transcript.some(entry => 
                entry.text && entry.text.toLowerCase().includes(searchTerm)
            );
            const responseMatch = conv.aiResponses.some(response => 
                response.content && response.content.toLowerCase().includes(searchTerm)
            );
            
            return titleMatch || topicMatch || transcriptMatch || responseMatch;
        });
    }

    async exportConversation(id) {
        const conversation = await this.getConversationById(id);
        if (!conversation) {
            throw new Error('Conversation not found');
        }

        return {
            ...conversation,
            exportedAt: new Date().toISOString(),
            version: '1.0'
        };
    }

    generateConversationTitle(conversationData) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        const dateStr = now.toLocaleDateString('ru-RU');

        // Try to generate smart title based on content
        if (conversationData.topic) {
            return `${conversationData.topic} - ${dateStr} ${timeStr}`;
        }

        if (conversationData.questions && conversationData.questions.length > 0) {
            const firstQuestion = conversationData.questions[0];
            const shortQuestion = firstQuestion.length > 50 
                ? firstQuestion.substring(0, 47) + '...'
                : firstQuestion;
            return `${shortQuestion} - ${dateStr} ${timeStr}`;
        }

        if (conversationData.transcript && conversationData.transcript.length > 0) {
            const firstText = conversationData.transcript[0].text || '';
            const shortText = firstText.length > 50 
                ? firstText.substring(0, 47) + '...'
                : firstText;
            return shortText ? `${shortText} - ${dateStr} ${timeStr}` : `Разговор ${dateStr} ${timeStr}`;
        }

        return `Разговор ${dateStr} ${timeStr}`;
    }

    // Auto-save current session to localStorage as backup
    saveSessionBackup(sessionData) {
        try {
            localStorage.setItem('current_session_backup', JSON.stringify({
                ...sessionData,
                lastSaved: Date.now()
            }));
        } catch (error) {
            console.warn('Failed to save session backup:', error);
        }
    }

    getSessionBackup() {
        try {
            const backup = localStorage.getItem('current_session_backup');
            return backup ? JSON.parse(backup) : null;
        } catch (error) {
            console.warn('Failed to load session backup:', error);
            return null;
        }
    }

    clearSessionBackup() {
        localStorage.removeItem('current_session_backup');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConversationManager;
}