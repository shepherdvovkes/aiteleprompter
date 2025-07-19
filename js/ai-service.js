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
        // Validate messages array
        if (!Array.isArray(messages)) {
            throw new Error(`Messages must be an array, got ${typeof messages}`);
        }
        
        // Validate each message
        messages.forEach((msg, index) => {
            if (!msg || typeof msg !== 'object') {
                throw new Error(`Message[${index}] must be an object, got ${typeof msg}`);
            }
            if (!msg.role || typeof msg.role !== 'string') {
                throw new Error(`Message[${index}].role must be a string, got ${typeof msg.role}`);
            }
            if (msg.content === undefined || msg.content === null) {
                throw new Error(`Message[${index}].content is missing`);
            }
            if (typeof msg.content !== 'string' && !Array.isArray(msg.content)) {
                console.error(`Invalid content type for message[${index}]:`, typeof msg.content, msg.content);
                throw new Error(`Message[${index}].content must be a string or array, got ${typeof msg.content}`);
            }
        });

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

        // Always use server endpoint for better compatibility and error handling
        // This ensures Safari on macOS works correctly and API key is managed securely
        if (this.apiKey && this.apiKey.trim() !== '') {
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
                
                // Handle specific API key errors
                if (response.status === 500 && errorData.error === 'OPENAI_API_KEY not configured') {
                    throw new Error('API key not configured. Please check your .env file or set API key in settings. ' + (errorData.message || ''));
                }
                
                throw new Error(errorData.error?.message || errorData.message || `API request failed with status ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.choices || data.choices.length === 0) {
                throw new Error('No response received from AI service');
            }
            
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
        // First, let's do a multi-step analysis for better accuracy
        const analysis = await this.performSemanticAnalysis(textBlock, conversationContext);
        return analysis.questions;
    }

    async performSemanticAnalysis(textBlock, conversationContext = '') {
        // Validate inputs
        if (typeof textBlock !== 'string') {
            console.error('TextBlock is not a string:', typeof textBlock, textBlock);
            throw new Error(`TextBlock must be a string, got ${typeof textBlock}`);
        }
        
        if (typeof conversationContext !== 'string') {
            console.error('ConversationContext is not a string:', typeof conversationContext, conversationContext);
            throw new Error(`ConversationContext must be a string, got ${typeof conversationContext}`);
        }

        const contextInstruction = conversationContext ? 
            `\n\nPREVIOUS CONVERSATION CONTEXT: """${conversationContext}"""\n` : '';
        
        // Step 1: Deep semantic analysis
        const semanticPrompt = `You are an advanced natural language analyzer specializing in question detection across multiple languages (primarily English and Russian). Your task is to perform deep semantic analysis to identify all forms of questions, requests, and implicit queries.

ANALYZE THE FOLLOWING for questions and requests:${contextInstruction}

DETECTION STRATEGY:
1. SEMANTIC ANALYSIS: Look beyond keywords - analyze the intent and expectation behind each sentence
2. CONTEXT INTEGRATION: Consider how each sentence relates to previous ones
3. CULTURAL PATTERNS: Account for different questioning styles in English vs Russian
4. IMPLICIT REQUESTS: Identify statements that clearly expect a response or explanation
5. TECHNICAL DISCOURSE: Recognize technical interview patterns and coding challenges

QUESTION TYPES TO DETECT:

A. EXPLICIT QUESTIONS:
   - Direct interrogatives (what, where, when, why, how, who)
   - Yes/no questions (do, does, did, can, could, would, should, will)
   - Choice questions (which, whether, either/or)

B. IMPLICIT QUESTIONS (statements expecting responses):
   - Explanatory requests: "I'd like to understand...", "Help me with..."
   - Demonstrative requests: "Show the implementation", "Walk through the process"
   - Comparative requests: "Compare these approaches", "What's better"
   - Opinion seeking: "Your thoughts on...", "What do you think"
   - Clarification seeking: mentions of concepts without explanation

C. TECHNICAL INTERVIEW PATTERNS:
   - Implementation challenges: "Write/code/implement/create/build..."
   - System design: "Design/architect/scale..." 
   - Problem solving: "How would you solve/approach/handle..."
   - Code analysis: "Debug/optimize/refactor/improve..."
   - Knowledge verification: "Explain the concept of...", "What is..."

D. CONTEXTUAL QUESTIONS:
   - Short responses that reference previous context: "Why?", "How so?", "Really?"
   - Follow-up inquiries that need previous sentences for full context
   - Incomplete thoughts that expect elaboration

E. CONVERSATIONAL CUES:
   - Statements ending with implicit question marks (rising intonation patterns)
   - Tentative statements seeking confirmation: "I think...", "Maybe...", "Probably..."
   - Uncertainty expressions: "I'm not sure about...", "I don't understand..."

ANALYSIS PROCESS:
1. Parse each sentence for semantic intent
2. Identify expectation of response or explanation
3. Combine fragmented questions with necessary context
4. Classify the type and urgency of each question
5. Consider technical vs non-technical context

For SHORT QUESTIONS lacking context (like "Why?", "How?", "What about X?"), you MUST:
- Combine with 2-3 preceding sentences to create a complete, standalone question
- Preserve the original intent while adding necessary context

Return a JSON object with:
{
  "potential_questions": [
    {
      "text": "Complete, contextual question text",
      "type": "direct|implicit|technical|contextual|conversational",
      "confidence": 0.0-1.0,
      "requires_context": true|false,
      "technical_level": "basic|intermediate|advanced|expert",
      "original_fragment": "original text if modified"
    }
  ],
  "overall_intent": "question|statement|mixed|unclear",
  "language_detected": "en|ru|mixed",
  "conversation_flow": "new_topic|follow_up|clarification|response_expected"
}

TEXT TO ANALYZE: """${textBlock}"""`;

        try {
            // Validate prompt before sending
            if (typeof semanticPrompt !== 'string') {
                console.error('Semantic prompt is not a string:', typeof semanticPrompt, semanticPrompt);
                throw new Error(`Semantic prompt must be a string, got ${typeof semanticPrompt}`);
            }
            
            const semanticResult = await this.callOpenAI([{ role: 'user', content: semanticPrompt }], 'gpt-4o', true);
            
            // Step 2: Validate and enhance results with linguistic patterns
            const enhancedQuestions = await this.enhanceWithLinguisticAnalysis(
                semanticResult.potential_questions || [], 
                textBlock, 
                conversationContext
            );
            
            return {
                questions: enhancedQuestions,
                overall_intent: semanticResult.overall_intent || 'unclear',
                language_detected: semanticResult.language_detected || 'en',
                conversation_flow: semanticResult.conversation_flow || 'new_topic'
            };
            
        } catch (error) {
            console.error('Semantic analysis failed:', error);
            // Fallback to enhanced pattern matching
            return this.fallbackQuestionDetection(textBlock, conversationContext);
        }
    }

    async enhanceWithLinguisticAnalysis(questions, textBlock, conversationContext) {
        // Additional linguistic validation and enhancement
        const enhancementPrompt = `Review and enhance these detected questions for accuracy and completeness. 

ORIGINAL TEXT: """${textBlock}"""
CONTEXT: """${conversationContext}"""

DETECTED QUESTIONS: ${JSON.stringify(questions)}

Your task:
1. Verify each question is actually a question or request
2. Ensure questions have sufficient context to be standalone
3. Merge related fragments into coherent questions
4. Remove false positives (statements that don't expect responses)
5. Add any missed implicit questions
6. Adjust confidence scores based on clarity and context

Return the same JSON structure with improved questions.`;

        try {
            // Validate prompt before sending
            if (typeof enhancementPrompt !== 'string') {
                console.error('Enhancement prompt is not a string:', typeof enhancementPrompt, enhancementPrompt);
                throw new Error(`Enhancement prompt must be a string, got ${typeof enhancementPrompt}`);
            }
            
            const enhanced = await this.callOpenAI([{ role: 'user', content: enhancementPrompt }], 'gpt-4o-mini', true);
            return enhanced.potential_questions || questions;
        } catch (error) {
            console.error('Enhancement failed:', error);
            return questions;
        }
    }

    fallbackQuestionDetection(textBlock, conversationContext) {
        // Enhanced pattern-based fallback when AI analysis fails
        const questions = [];
        const sentences = this.splitIntoSentences(textBlock);
        
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i].trim();
            const analysis = this.analyzeSentencePatterns(sentence, sentences, i, conversationContext);
            
            if (analysis.isQuestion) {
                questions.push({
                    text: analysis.questionText,
                    type: analysis.type,
                    confidence: analysis.confidence,
                    requires_context: analysis.requiresContext,
                    technical_level: analysis.technicalLevel
                });
            }
        }
        
        return {
            questions: questions,
            overall_intent: questions.length > 0 ? 'question' : 'statement',
            language_detected: this.detectLanguage(textBlock),
            conversation_flow: 'new_topic'
        };
    }

    splitIntoSentences(text) {
        // Enhanced sentence splitting that handles various punctuation and languages
        return text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    }

    analyzeSentencePatterns(sentence, allSentences, index, context) {
        const lowerSentence = sentence.toLowerCase();
        let isQuestion = false;
        let type = 'statement';
        let confidence = 0.0;
        let requiresContext = false;
        let technicalLevel = 'basic';
        let questionText = sentence;

        // Enhanced pattern matching with confidence scoring
        const patterns = {
            direct: {
                regex: /^(what|where|when|why|how|who|which|whose|whom|do|does|did|can|could|would|should|will|is|are|was|were|have|has|had|дайте|скажите|что|где|когда|почему|как|кто|какой|чей|делать|может|мог|будет|является|есть|был|имеет)/i,
                confidence: 0.95
            },
            questionMark: {
                regex: /\?$/,
                confidence: 0.98
            },
            imperative: {
                regex: /^(tell me|show me|explain|describe|implement|write|code|create|build|design|compare|walk through|расскажи|покажи|объясни|опиши|реализуй|напиши|создай|построй|спроектируй|сравни)/i,
                confidence: 0.85
            },
            technical: {
                regex: /(algorithm|function|code|programming|software|system|database|api|framework|library|class|object|variable|loop|condition|алгоритм|функция|код|программирование|система|база данных|фреймворк|библиотека|класс|объект|переменная|цикл|условие)/i,
                confidence: 0.8
            },
            short: {
                regex: /^(why|how|what|really|true|sure|почему|как|что|правда|точно)[\?\.]?$/i,
                confidence: 0.7,
                needsContext: true
            },
            uncertainty: {
                regex: /(i don't understand|i'm not sure|unclear|confused|help|не понимаю|не уверен|неясно|запутался|помощь)/i,
                confidence: 0.75
            }
        };

        // Check each pattern
        for (const [patternType, pattern] of Object.entries(patterns)) {
            if (pattern.regex.test(lowerSentence)) {
                isQuestion = true;
                type = patternType === 'technical' ? 'technical' : 
                      patternType === 'short' ? 'contextual' : 
                      patternType === 'questionMark' ? 'direct' : 'implicit';
                confidence = Math.max(confidence, pattern.confidence);
                
                if (pattern.needsContext || patternType === 'short') {
                    requiresContext = true;
                    // Add context from previous sentences
                    const contextSentences = allSentences.slice(Math.max(0, index - 2), index);
                    if (contextSentences.length > 0) {
                        questionText = contextSentences.join(' ') + ' ' + sentence;
                    }
                }
                
                if (patterns.technical.regex.test(lowerSentence)) {
                    technicalLevel = 'intermediate';
                }
                break;
            }
        }

        // Additional heuristics for missed patterns
        if (!isQuestion) {
            // Check for statements that end with expectation
            if (this.hasImplicitExpectation(sentence)) {
                isQuestion = true;
                type = 'implicit';
                confidence = 0.6;
            }
        }

        return {
            isQuestion,
            questionText,
            type,
            confidence,
            requiresContext,
            technicalLevel
        };
    }

    hasImplicitExpectation(sentence) {
        const expectationPatterns = [
            /let me know/i,
            /i'd like to know/i,
            /i want to understand/i,
            /help me with/i,
            /хочу знать/i,
            /хотел бы понять/i,
            /помоги с/i
        ];
        
        return expectationPatterns.some(pattern => pattern.test(sentence));
    }

    detectLanguage(text) {
        const russianChars = (text.match(/[а-яё]/gi) || []).length;
        const totalChars = text.replace(/\s/g, '').length;
        return russianChars / totalChars > 0.3 ? 'ru' : 'en';
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
            // Validate prompt before sending
            if (typeof prompt !== 'string') {
                console.error('Categorization prompt is not a string:', typeof prompt, prompt);
                throw new Error(`Categorization prompt must be a string, got ${typeof prompt}`);
            }
            
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
            // Validate prompt before sending
            if (typeof prompt !== 'string') {
                console.error('Prioritization prompt is not a string:', typeof prompt, prompt);
                throw new Error(`Prioritization prompt must be a string, got ${typeof prompt}`);
            }
            
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

    async detectFollowUpQuestions(newText, recentContext, previousQuestions = []) {
        const prompt = `You are analyzing a conversation to detect follow-up and clarifying questions. Your task is to identify when new text contains questions that are directly related to or clarify previously asked questions.

ANALYSIS CRITERIA:
1. DIRECT FOLLOW-UPS: Questions that explicitly reference previous questions ("Can you explain that better?", "What did you mean by X?")
2. CLARIFYING QUESTIONS: Short questions that need context from previous questions ("Why?", "How so?", "Really?", "What about X?")
3. ELABORATION REQUESTS: Requests for more detail on previous topics ("Tell me more about...", "Can you give an example?")
4. ALTERNATIVE APPROACHES: Questions asking about different ways to solve previously discussed problems
5. CONTEXTUAL CONNECTIONS: Questions that make sense only in the context of previous questions

PREVIOUS QUESTIONS CONTEXT:
${previousQuestions.map(q => `- ${q.text} (${q.category || 'Unknown'})`).join('\n')}

RECENT CONVERSATION:
"""${recentContext}"""

NEW TEXT TO ANALYZE:
"""${newText}"""

Return JSON with:
{
  "has_follow_up": boolean,
  "follow_up_questions": [
    {
      "text": "complete question with context",
      "original_text": "raw text from input",
      "relates_to": "text of the previous question it relates to",
      "relationship_type": "clarification|elaboration|alternative|direct_follow_up",
      "priority": "high|medium|low"
    }
  ],
  "standalone_questions": [
    {
      "text": "questions that are independent",
      "type": "technical|general|personal"
    }
  ]
}`;

        try {
            const result = await this.callOpenAI([{ role: 'user', content: prompt }], 'gpt-4o', true);
            return {
                has_follow_up: result.has_follow_up || false,
                follow_up_questions: result.follow_up_questions || [],
                standalone_questions: result.standalone_questions || []
            };
        } catch (error) {
            console.error('Follow-up question detection failed:', error);
            return {
                has_follow_up: false,
                follow_up_questions: [],
                standalone_questions: []
            };
        }
    }

    async generateResponse(question, context, topic = '') {
        // Check for demo mode first
        if (window.demoMode && window.demoMode.isEnabled()) {
            return await window.demoMode.generateDemoResponse(question, context);
        }
        
        // Validate inputs to prevent type errors
        if (typeof question !== 'string') {
            console.error('Question is not a string:', typeof question, question);
            throw new Error(`Question must be a string, got ${typeof question}`);
        }
        
        if (typeof context !== 'string') {
            console.error('Context is not a string:', typeof context, context);
            throw new Error(`Context must be a string, got ${typeof context}`);
        }

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

        // Additional validation for messages before sending
        messages.forEach((msg, index) => {
            if (typeof msg.content !== 'string') {
                console.error(`Message[${index}].content is not a string:`, typeof msg.content, msg.content);
                throw new Error(`Message[${index}].content must be a string, got ${typeof msg.content}`);
            }
        });

        try {
            return await this.callOpenAI(messages);
        } catch (error) {
            console.error('Response generation failed:', error);
            throw error;
        }
    }

    async processTextAnalysis(textBlock, conversationContext = '') {
        // Validate inputs before processing
        if (typeof textBlock !== 'string') {
            console.error('ProcessTextAnalysis: textBlock is not a string:', typeof textBlock, textBlock);
            throw new Error(`TextBlock must be a string, got ${typeof textBlock}`);
        }
        
        if (typeof conversationContext !== 'string') {
            console.error('ProcessTextAnalysis: conversationContext is not a string:', typeof conversationContext, conversationContext);
            throw new Error(`ConversationContext must be a string, got ${typeof conversationContext}`);
        }

        if (this.isProcessing) {
            this.requestQueue.push({ textBlock, conversationContext });
            return;
        }

        this.isProcessing = true;

        try {
            // Perform advanced semantic analysis
            const analysis = await this.performSemanticAnalysis(textBlock, conversationContext);
            
            if (!analysis.questions || analysis.questions.length === 0) {
                // Log analysis result for debugging
                console.log('No questions detected:', { 
                    text: textBlock,
                    intent: analysis.overall_intent,
                    language: analysis.language_detected,
                    flow: analysis.conversation_flow
                });
                return null;
            }

            // Filter out low-confidence questions if necessary
            const validQuestions = analysis.questions.filter(q => q.confidence > 0.5);
            
            if (validQuestions.length === 0) {
                return null;
            }

            // Categorize and prioritize questions
            const categorizedQuestions = await Promise.all(
                validQuestions.map(async (q) => ({
                    ...q,
                    category: await this.categorizeQuestion(q.text, conversationContext)
                }))
            );

            const prioritized = await this.prioritizeQuestions(conversationContext, categorizedQuestions);

            // Validate prioritized results
            if (prioritized.main_question && typeof prioritized.main_question !== 'string') {
                console.error('Main question is not a string:', typeof prioritized.main_question, prioritized.main_question);
                prioritized.main_question = null;
            }
            
            if (prioritized.secondary_question && typeof prioritized.secondary_question !== 'string') {
                console.error('Secondary question is not a string:', typeof prioritized.secondary_question, prioritized.secondary_question);
                prioritized.secondary_question = null;
            }

            return {
                questions: categorizedQuestions,
                priority: prioritized,
                analysis_metadata: {
                    overall_intent: analysis.overall_intent,
                    language_detected: analysis.language_detected,
                    conversation_flow: analysis.conversation_flow
                }
            };

        } catch (error) {
            console.error('Text analysis failed:', error);
            // Enhanced fallback - try basic pattern matching
            return await this.basicFallbackAnalysis(textBlock, conversationContext);
        } finally {
            this.isProcessing = false;
            
            // Process next item in queue
            if (this.requestQueue.length > 0) {
                const next = this.requestQueue.shift();
                setTimeout(() => this.processTextAnalysis(next.textBlock, next.conversationContext), 100);
            }
        }
    }

    async basicFallbackAnalysis(textBlock, conversationContext) {
        try {
            console.log('Using basic fallback analysis for:', textBlock);
            
            // Use the enhanced fallback detection
            const fallbackResult = this.fallbackQuestionDetection(textBlock, conversationContext);
            
            if (fallbackResult.questions.length === 0) {
                return null;
            }

            // Simple categorization for fallback
            const categorizedQuestions = fallbackResult.questions.map(q => ({
                ...q,
                category: q.technical_level === 'basic' ? 'General' : 'Technical'
            }));

            return {
                questions: categorizedQuestions,
                priority: {
                    main_question: categorizedQuestions[0]?.text || null,
                    secondary_question: categorizedQuestions[1]?.text || null
                },
                analysis_metadata: {
                    overall_intent: fallbackResult.overall_intent,
                    language_detected: fallbackResult.language_detected,
                    conversation_flow: fallbackResult.conversation_flow,
                    fallback_used: true
                }
            };
        } catch (error) {
            console.error('Even fallback analysis failed:', error);
            return null;
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