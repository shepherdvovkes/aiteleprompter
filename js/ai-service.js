/**
 * AIService handles all AI-related functionality including OpenAI API calls,
 * question detection, and conversation analysis
 */
class AIService {
    constructor() {
        this.apiKey = localStorage.getItem('openai_api_key') || '';
        this.conversationTopic = localStorage.getItem('conversation_topic') || '';
        this.isProcessing = false;
        this.requestQueue = [];
    }

    setApiKey(apiKey) {
        this.apiKey = apiKey;
        localStorage.setItem('openai_api_key', apiKey);
    }

    setConversationTopic(topic) {
        this.conversationTopic = topic;
        localStorage.setItem('conversation_topic', topic);
    }

    async testConnection() {
        if (!this.apiKey) {
            throw new Error('API key not configured');
        }

        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });

            if (!response.ok) {
                throw new Error(`API status ${response.status}`);
            }

            console.log('API connection test successful');
            return true;
        } catch (error) {
            console.error('API connection test failed:', error);
            throw error;
        }
    }

    async callOpenAI(messages, model = 'gpt-4o-mini', needsJson = false) {
        const body = {
            model,
            messages,
            temperature: 0.2
        };

        if (needsJson) {
            body.response_format = { type: 'json_object' };
        }

        const headers = { 'Content-Type': 'application/json' };
        let url = 'https://api.openai.com/v1/chat/completions';

        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        } else {
            url = '/api/chat';
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || 'API request failed');
            }

            const data = await response.json();
            const content = data.choices[0].message.content;
            
            return needsJson ? JSON.parse(content) : content;
        } catch (error) {
            console.error('OpenAI API call failed:', error);
            throw error;
        }
    }

    async punctuateText(textBlock) {
        const systemPrompt = 'You are a helpful editor. Correct the following text by adding punctuation (commas, periods, question marks) and capitalizing the beginning of sentences. Return only the corrected text, without any additional comments.';
        
        return await this.callOpenAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: textBlock }
        ]);
    }

    async identifyQuestions(textBlock, conversationContext = '') {
        const contextInstruction = conversationContext ? 
            `\n\nCONVERSATION CONTEXT (previous sentences): """${conversationContext}"""\n\n` : '';
        
        const prompt = `You are an expert at identifying questions and requests in technical interview contexts. Your task is to identify ALL user questions, requests, and implicit queries in the text, including:${contextInstruction}

1. DIRECT QUESTIONS: Traditional questions ending with "?" 
2. IMPLICIT QUESTIONS: Statements that expect a response or explanation:
   - "Tell me about..." / "Расскажите о..."
   - "Explain..." / "Объясните..."  
   - "Show me how..." / "Покажите как..."
   - "Walk me through..." / "Проведите меня через..."
   - "What do you think about..." / "Что вы думаете о..."
   - "How would you..." / "Как бы вы..."
   - "Can you..." / "Можете ли вы..."
   - "Could you..." / "Не могли бы вы..."
   - "Would you..." / "Хотели бы вы..."

3. TECHNICAL INTERVIEW PATTERNS:
   - "Implement a..." / "Реализуйте..."
   - "Design a system..." / "Спроектируйте систему..."
   - "Write a function..." / "Напишите функцию..."
   - "Optimize this..." / "Оптимизируйте это..."
   - "Debug this code..." / "Отладьте этот код..."
   - "Compare X and Y..." / "Сравните X и Y..."
   - "What's the difference between..." / "В чём разница между..."
   - "Pros and cons of..." / "Плюсы и минусы..."

4. CONTEXTUAL ANALYSIS: If a statement seems incomplete or refers to previous context (like "Why?", "How?", "What about X?"), combine it with 2-3 preceding sentences to form a complete, standalone question.

5. IMPERATIVE STATEMENTS: Commands that imply a question or request for explanation:
   - "Consider this scenario..." / "Рассмотрите этот сценарий..."
   - "Assume we have..." / "Предположим, у нас есть..."
   - "Let's say..." / "Допустим..."

IMPORTANT RULES:
- If a question is short and lacks context (e.g., "why?", "how?"), MUST combine it with preceding sentences
- For technical terms, assume they are part of an interview question
- Include statements that expect demonstration of knowledge
- Consider cultural context (Russian vs English phrasing patterns)
- If someone mentions a technology/concept and then asks for clarification, treat the whole segment as one question

Return ONLY a valid JSON object with a key "potential_questions", which is an array of objects, each with a "text" key containing the full, contextual question and a "type" key indicating the question type ("direct", "implicit", "technical", "contextual"). If no questions are found, return an empty array.

TEXT: """${textBlock}"""`;
        
        try {
            const result = await this.callOpenAI([{ role: 'user', content: prompt }], 'gpt-4o-mini', true);
            return result.potential_questions || [];
        } catch (error) {
            console.error('Question identification failed:', error);
            return [];
        }
    }

    async categorizeQuestion(question, context) {
        const categories = ['Technical', 'General', 'Personal', 'Financial'];
        const prompt = `You are categorizing questions from a technical interview context. Analyze the question and its context to determine the most appropriate category.

CATEGORIES:
- Technical: Programming, algorithms, system design, databases, frameworks, debugging, code optimization, software architecture, data structures, etc.
- General: Non-technical work-related topics, methodologies, project management, team collaboration, general problem-solving approaches
- Personal: Background, experience, career goals, soft skills, personal preferences, work style
- Financial: Salary expectations, benefits, compensation, budget-related technical decisions

Consider the interview context when categorizing. Even seemingly general questions might be technical if they relate to software development practices.

Return JSON with a "category" key.

CONTEXT: """${context}"""

QUESTION: "${question}"`;
        
        try {
            const result = await this.callOpenAI([{ role: 'user', content: prompt }], 'gpt-4o-mini', true);
            return categories.includes(result.category) ? result.category : 'General';
        } catch (error) {
            console.error('Question categorization failed:', error);
            return 'General';
        }
    }

    async prioritizeQuestions(context, questions) {
        const prompt = `You are analyzing questions from a technical interview. Your task is to prioritize questions based on their importance and relevance.

PRIORITIZATION RULES:
1. Technical questions have highest priority
2. Questions requiring immediate code demonstration are very important  
3. System design questions are high priority
4. Follow-up questions to previous answers should be prioritized
5. Short clarifying questions ("why?", "how?") should be combined with their context and prioritized highly
6. General knowledge questions are medium priority
7. Personal/background questions are lower priority unless specifically asked

From the provided context and questions, select:
- ONE 'main_question': The most important/urgent question that should be answered first
- ONE 'secondary_question': A follow-up or less urgent question (can be null)

If there are multiple technical questions, prioritize the most specific or actionable one.

Return JSON with "main_question" and "secondary_question" fields. Set secondary_question to null if there's only one important question.

CONTEXT: """${context}"""

QUESTIONS: ${JSON.stringify(questions)}`;

        try {
            const result = await this.callOpenAI([{ role: 'user', content: prompt }], 'gpt-4o-mini', true);
            return {
                main_question: result.main_question || null,
                secondary_question: result.secondary_question || null
            };
        } catch (error) {
            console.error('Question prioritization failed:', error);
            return { main_question: null, secondary_question: null };
        }
    }

    async generateResponse(question, context, topic = '') {
        const contextualPrompt = topic ? 
            `You are an expert in ${topic}. ` : 
            'You are a knowledgeable assistant. ';

        const systemPrompt = contextualPrompt + 
            'Answer the following question based on the conversation context. ' +
            'Be precise, helpful, and technical when appropriate. ' +
            'If you need to write code, use proper formatting and explain your solution.';

        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        if (context.trim()) {
            messages.push({ role: 'user', content: `Context: ${context}` });
        }

        messages.push({ role: 'user', content: question });

        try {
            return await this.callOpenAI(messages);
        } catch (error) {
            console.error('Response generation failed:', error);
            throw error;
        }
    }

    async processTextAnalysis(textBlock, conversationContext = '') {
        if (this.isProcessing) {
            this.requestQueue.push({ textBlock, conversationContext });
            return;
        }

        this.isProcessing = true;

        try {
            // Identify questions in the text
            const questions = await this.identifyQuestions(textBlock, conversationContext);
            
            if (questions.length === 0) {
                return null;
            }

            // Categorize and prioritize questions
            const categorizedQuestions = await Promise.all(
                questions.map(async (q) => ({
                    ...q,
                    category: await this.categorizeQuestion(q.text, conversationContext)
                }))
            );

            const prioritized = await this.prioritizeQuestions(conversationContext, categorizedQuestions);

            return {
                questions: categorizedQuestions,
                priority: prioritized
            };

        } catch (error) {
            console.error('Text analysis failed:', error);
            return null;
        } finally {
            this.isProcessing = false;
            
            // Process next item in queue
            if (this.requestQueue.length > 0) {
                const next = this.requestQueue.shift();
                setTimeout(() => this.processTextAnalysis(next.textBlock, next.conversationContext), 100);
            }
        }
    }

    getTagClassForCategory(category) {
        const tagClasses = {
            'Technical': 'tag-technical',
            'General': 'tag-general',
            'Personal': 'tag-personal',
            'Financial': 'tag-financial'
        };
        return tagClasses[category] || 'tag-general';
    }
}

// Export for use in other modules
window.AIService = AIService;