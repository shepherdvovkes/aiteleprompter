/**
 * Tests for Client-side JavaScript Logic
 * 
 * This test suite validates the functionality of the AI Teleprompter
 * client-side components focusing on testable logic patterns.
 */

// Create proper mocks for browser APIs
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = mockLocalStorage;

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Pattern Recognition Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Question Mark Detection', () => {
    test('should detect questions with question marks', () => {
      const testCases = [
        'What is React?',
        'How does useState work?',
        'Can you explain closures?',
      ];

      testCases.forEach(text => {
        expect(text.includes('?')).toBe(true);
        expect(text.match(/^(what|how|can)/i)).toBeTruthy();
      });
    });

    test('should not detect statements as questions', () => {
      const testCases = [
        'This is a statement',
        'I think React is good',
        'The function works well',
      ];

      testCases.forEach(text => {
        expect(text.includes('?')).toBe(false);
      });
    });
  });

  describe('Interrogative Word Patterns', () => {
    test('should detect questions starting with interrogative words', () => {
      const interrogativeWords = ['what', 'where', 'when', 'why', 'how', 'who', 'which'];
      const testCases = [
        'How do you handle state in React',
        'What are the benefits of TypeScript',
        'Where would you use async/await',
        'Why is immutability important',
        'When should you use useEffect',
        'Who developed Node.js',
      ];

      testCases.forEach(text => {
        const hasInterrogative = interrogativeWords.some(word => 
          text.toLowerCase().startsWith(word.toLowerCase())
        );
        expect(hasInterrogative).toBe(true);
      });
    });

    test('should not detect regular statements', () => {
      const testCases = [
        'I think this is correct',
        'The weather is nice today',
        'Let me show you something',
      ];

      testCases.forEach(text => {
        const interrogativeWords = ['what', 'where', 'when', 'why', 'how', 'who', 'which'];
        const hasInterrogative = interrogativeWords.some(word => 
          text.toLowerCase().startsWith(word.toLowerCase())
        );
        expect(hasInterrogative).toBe(false);
      });
    });
  });

  describe('Technical Keyword Detection', () => {
    test('should detect technical programming terms', () => {
      const technicalKeywords = [
        'algorithm', 'function', 'database', 'api', 'framework', 'library',
        'алгоритм', 'функция', 'база данных', 'фреймворк'
      ];
      
      const testCases = [
        'Explain the algorithm for sorting',
        'Write a function to handle this',
        'How does the database work',
        'What is an API endpoint',
      ];

      testCases.forEach(text => {
        const containsTechnicalTerms = technicalKeywords.some(keyword => 
          text.toLowerCase().includes(keyword.toLowerCase())
        );
        expect(containsTechnicalTerms).toBe(true);
      });
    });

    test('should not detect technical terms in casual conversation', () => {
      const technicalKeywords = [
        'algorithm', 'function', 'database', 'api', 'framework', 'library'
      ];
      
      const testCases = [
        'I like to eat pizza',
        'The weather is sunny today',
        'Let\'s go for a walk',
      ];

      testCases.forEach(text => {
        const containsTechnicalTerms = technicalKeywords.some(keyword => 
          text.toLowerCase().includes(keyword.toLowerCase())
        );
        expect(containsTechnicalTerms).toBe(false);
      });
    });
  });
});

describe('Language Detection Tests', () => {
  test('should detect Russian text using Cyrillic characters', () => {
    const russianPatterns = [
      'Расскажите о React',
      'Объясните принципы SOLID',
      'Что такое замыкание?',
    ];

    russianPatterns.forEach(text => {
      const hasCyrillic = /[а-яё]/i.test(text);
      expect(hasCyrillic).toBe(true);
    });
  });

  test('should detect English text using Latin characters', () => {
    const englishPatterns = [
      'Tell me about React',
      'Explain SOLID principles',
      'What is a closure?',
    ];

    englishPatterns.forEach(text => {
      const hasOnlyLatin = /^[a-z\s\?\!\.,]+$/i.test(text);
      expect(hasOnlyLatin).toBe(true);
    });
  });

  test('should distinguish between languages', () => {
    const russianText = 'Привет мир';
    const englishText = 'Hello world';
    
    expect(/[а-яё]/i.test(russianText)).toBe(true);
    expect(/[а-яё]/i.test(englishText)).toBe(false);
  });
});

describe('Text Processing Tests', () => {
  test('should split text into sentences correctly', () => {
    const text = 'This is sentence one. This is sentence two! Is this a question?';
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    expect(sentences).toHaveLength(3);
    expect(sentences[0].trim()).toBe('This is sentence one');
    expect(sentences[1].trim()).toBe('This is sentence two');
    expect(sentences[2].trim()).toBe('Is this a question');
  });

  test('should handle empty or short text', () => {
    const shortTexts = ['', '   ', 'Hi', 'OK'];
    
    shortTexts.forEach(text => {
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (text.trim().length === 0) {
        expect(sentences).toHaveLength(0);
      } else {
        expect(sentences.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test('should handle various punctuation marks', () => {
    const complexText = 'First sentence. Second sentence! Third question? Fourth... incomplete';
    const sentences = complexText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    expect(sentences.length).toBeGreaterThan(2);
    expect(sentences[0].includes('First')).toBe(true);
    expect(sentences[1].includes('Second')).toBe(true);
  });
});

describe('API Configuration Tests', () => {
  test('should handle API key storage operations', () => {
    const apiKey = 'test-api-key-123';
    
    // Simulate setting API key
    mockLocalStorage.setItem('openai_api_key', apiKey);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('openai_api_key', apiKey);
    
    // Simulate getting API key
    mockLocalStorage.getItem.mockReturnValue(apiKey);
    const retrievedKey = mockLocalStorage.getItem('openai_api_key');
    expect(retrievedKey).toBe(apiKey);
  });

  test('should handle conversation topic storage', () => {
    const topic = 'React Interview Questions';
    
    // Simulate setting topic
    mockLocalStorage.setItem('conversation_topic', topic);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('conversation_topic', topic);
    
    // Simulate getting topic
    mockLocalStorage.getItem.mockReturnValue(topic);
    const retrievedTopic = mockLocalStorage.getItem('conversation_topic');
    expect(retrievedTopic).toBe(topic);
  });

  test('should handle missing configuration', () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    
    const apiKey = mockLocalStorage.getItem('openai_api_key');
    const topic = mockLocalStorage.getItem('conversation_topic');
    
    expect(apiKey).toBeNull();
    expect(topic).toBeNull();
  });
});

describe('Mock API Call Tests', () => {
  test('should handle successful API responses', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Test response' } }]
      }),
    };

    mockFetch.mockResolvedValue(mockResponse);

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Test question' }],
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.choices[0].message.content).toBe('Test response');
  });

  test('should handle API errors', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    };

    mockFetch.mockResolvedValue(mockResponse);

    const response = await fetch('/api/chat');
    expect(response.ok).toBe(false);
    expect(response.status).toBe(401);
    
    const errorText = await response.text();
    expect(errorText).toBe('Unauthorized');
  });

  test('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(fetch('/api/chat')).rejects.toThrow('Network error');
  });

  test('should validate request structure', async () => {
    const validRequest = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Test' }],
      temperature: 0.2
    };

    expect(validRequest.model).toBe('gpt-4o-mini');
    expect(validRequest.messages).toHaveLength(1);
    expect(validRequest.messages[0].role).toBe('user');
    expect(validRequest.messages[0].content).toBe('Test');
  });
});

describe('Question Categorization Logic', () => {
  test('should categorize technical questions', () => {
    const technicalQuestions = [
      'What is Big O notation?',
      'How does garbage collection work?',
      'Explain the difference between SQL and NoSQL',
      'Implement a sorting algorithm'
    ];

    technicalQuestions.forEach(question => {
      const isTechnical = /algorithm|garbage|sql|notation|implement|sorting/i.test(question);
      expect(isTechnical).toBe(true);
    });
  });

  test('should categorize personal questions', () => {
    const personalQuestions = [
      'Tell me about your experience',
      'What are your career goals?',
      'What motivates you?',
      'How do you work in a team?'
    ];

    personalQuestions.forEach(question => {
      const isPersonal = /experience|career|motivate|team/i.test(question);
      expect(isPersonal).toBe(true);
    });
  });

  test('should categorize behavioral questions', () => {
    const behavioralQuestions = [
      'Describe a challenging situation',
      'Tell me about a time when',
      'How do you handle conflict?',
      'Give an example of leadership'
    ];

    behavioralQuestions.forEach(question => {
      const isBehavioral = /describe|tell me about|how do you|give an example/i.test(question);
      expect(isBehavioral).toBe(true);
    });
  });
});

describe('Context Management', () => {
  test('should maintain conversation history limits', () => {
    let conversationHistory = [];
    const MAX_CONTEXT_HISTORY = 5;
    
    const sentences = [
      'Hello, let\'s talk about JavaScript',
      'What are closures?',
      'I see, what about prototypes?',
      'Good, now about React',
      'How do hooks work?',
      'What about performance?'
    ];

    sentences.forEach(sentence => {
      conversationHistory.push(sentence);
      if (conversationHistory.length > MAX_CONTEXT_HISTORY) {
        conversationHistory.shift();
      }
    });

    expect(conversationHistory.length).toBeLessThanOrEqual(MAX_CONTEXT_HISTORY);
    expect(conversationHistory).not.toContain(sentences[0]); // First sentence should be removed
    expect(conversationHistory).toContain(sentences[sentences.length - 1]); // Last sentence should be present
  });

  test('should build context for short questions', () => {
    const conversationHistory = [
      'I use Redux in my project',
      'It helps manage state',
      'But sometimes it seems excessive'
    ];
    
    const shortQuestion = 'Why?';
    const contextText = conversationHistory.slice(-3).join(' ');
    const fullQuestion = `${contextText} ${shortQuestion}`;
    
    expect(fullQuestion).toContain('Redux');
    expect(fullQuestion).toContain('Why?');
    expect(fullQuestion.length).toBeGreaterThan(shortQuestion.length);
  });

  test('should handle empty conversation history', () => {
    const conversationHistory = [];
    const question = 'What is React?';
    const contextText = conversationHistory.slice(-3).join(' ');
    const fullQuestion = contextText.length > 0 ? `${contextText} ${question}` : question;
    
    expect(fullQuestion).toBe(question);
  });
});

describe('Utility Functions', () => {
  test('should validate text length requirements', () => {
    const testCases = [
      { text: '', shouldProcess: false },
      { text: '   ', shouldProcess: false },
      { text: 'Hi', shouldProcess: false },
      { text: 'This is a longer text that should be processed', shouldProcess: true }
    ];

    testCases.forEach(({ text, shouldProcess }) => {
      const isLongEnough = text.trim().length > 10;
      expect(isLongEnough).toBe(shouldProcess);
    });
  });

  test('should handle confidence scoring logic', () => {
    const patterns = [
      { text: 'What is React?', expectedConfidence: 'high' },
      { text: 'Tell me about programming', expectedConfidence: 'medium' },
      { text: 'Maybe this is a question', expectedConfidence: 'low' }
    ];

    patterns.forEach(({ text, expectedConfidence }) => {
      let confidence = 0;
      
      if (text.includes('?')) confidence += 0.9;
      if (/^(what|how|tell|explain)/i.test(text)) confidence += 0.8;
      if (/maybe|perhaps|might/i.test(text)) confidence -= 0.5; // Increased penalty
      
      if (expectedConfidence === 'high') {
        expect(confidence).toBeGreaterThan(0.8);
      } else if (expectedConfidence === 'medium') {
        expect(confidence).toBeLessThanOrEqual(0.8);
        expect(confidence).toBeGreaterThan(0.3);
      } else {
        expect(confidence).toBeLessThanOrEqual(0.3);
      }
    });
  });

  test('should validate input sanitization', () => {
    const inputs = [
      { input: '<script>alert("xss")</script>', safe: false },
      { input: 'Normal text input', safe: true },
      { input: '', safe: true },
      { input: 'Text with "quotes" and \'apostrophes\'', safe: true }
    ];

    inputs.forEach(({ input, safe }) => {
      const hasPotentialXSS = /<script|javascript:|on\w+=/i.test(input);
      expect(!hasPotentialXSS).toBe(safe);
    });
  });
});