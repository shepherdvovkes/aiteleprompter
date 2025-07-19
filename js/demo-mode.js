/**
 * Demo Mode - симуляция ответов AI для тестирования системы без API ключа
 */
class DemoMode {
    constructor() {
        this.enabled = false;
        this.demoResponses = {
            'что такое rest api': 'REST API (Representational State Transfer) - это архитектурный стиль для создания веб-сервисов. Основные принципы:\n\n1. **Stateless** - каждый запрос независим\n2. **HTTP методы** - GET, POST, PUT, DELETE\n3. **Ресурсы** - идентифицируются URL\n4. **JSON формат** - стандартный обмен данными\n\nПример использования:\n```javascript\nfetch("/api/users/123", {\n  method: "GET",\n  headers: {"Content-Type": "application/json"}\n})\n```',
            
            'как реализовать кеширование в redis': 'Redis кеширование - эффективный способ ускорить приложение:\n\n## Основные стратегии:\n\n1. **Cache-Aside**\n```javascript\nconst getUser = async (id) => {\n  let user = await redis.get(`user:${id}`);\n  if (!user) {\n    user = await db.findUser(id);\n    await redis.setex(`user:${id}`, 3600, JSON.stringify(user));\n  }\n  return JSON.parse(user);\n};\n```\n\n2. **Write-Through**\n3. **Write-Behind**\n\n## Для микросервисов:\n- Shared Redis cluster\n- Consistent hashing\n- TTL policies',
            
            'объясни архитектуру микросервисов': 'Микросервисная архитектура - подход разработки, где приложение состоит из множества небольших независимых сервисов:\n\n## Ключевые принципы:\n\n1. **Независимость** - каждый сервис развертывается отдельно\n2. **Специализация** - один сервис = одна ответственность\n3. **Коммуникация** - через API (REST, gRPC)\n4. **Данные** - своя БД для каждого сервиса\n\n## Преимущества:\n- Масштабируемость\n- Технологическое разнообразие\n- Отказоустойчивость\n\n## Недостатки:\n- Сложность инфраструктуры\n- Сетевые задержки\n- Distributed tracing',
            
            'а что насчет безопасности': 'Безопасность в микросервисах - критически важный аспект:\n\n## Основные угрозы:\n1. **Man-in-the-middle** атаки\n2. **Service spoofing**\n3. **Data breaches**\n4. **DDoS атаки**\n\n## Решения:\n\n### Authentication & Authorization:\n```javascript\n// JWT токены\nconst token = jwt.sign({userId, role}, secret);\n\n// OAuth 2.0 / OpenID Connect\n// Service-to-service authentication\n```\n\n### Network Security:\n- **TLS/SSL** для всех соединений\n- **Service mesh** (Istio, Linkerd)\n- **Network segmentation**\n- **API Gateway** с rate limiting\n\n### Monitoring:\n- Логирование всех запросов\n- Audit trails\n- Anomaly detection',
            
            'что такое docker': 'Docker - платформа для контейнеризации приложений:\n\n## Основные концепции:\n\n### Контейнеры vs VM:\n- Легче и быстрее\n- Общее ядро ОС\n- Изоляция процессов\n\n### Dockerfile:\n```dockerfile\nFROM node:18-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nEXPOSE 3000\nCMD ["npm", "start"]\n```\n\n### Docker Compose:\n```yaml\nversion: "3.8"\nservices:\n  app:\n    build: .\n    ports:\n      - "3000:3000"\n  redis:\n    image: redis:alpine\n```\n\n## Преимущества:\n- Консистентность окружений\n- Быстрое развертывание\n- Масштабируемость',
            
            'default': 'Это интересный вопрос! В демо-режиме я могу ответить на:\n\n- Вопросы про REST API\n- Микросервисы и их безопасность\n- Docker и контейнеризацию\n- Кеширование в Redis\n\nДля полнофункциональной работы настройте OpenAI API ключ в настройках.'
        };
    }

    enable() {
        this.enabled = true;
        console.log('🎭 Demo mode enabled - AI responses will be simulated');
    }

    disable() {
        this.enabled = false;
        console.log('Demo mode disabled');
    }

    isEnabled() {
        return this.enabled;
    }

    async generateDemoResponse(question, context = '') {
        if (!this.enabled) return null;

        // Симуляция задержки API
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));

        const lowerQuestion = question.toLowerCase();
        
        // Поиск подходящего ответа
        for (const [key, response] of Object.entries(this.demoResponses)) {
            if (key !== 'default' && lowerQuestion.includes(key)) {
                return response;
            }
        }

        // Обработка follow-up вопросов
        if (lowerQuestion.includes('follow-up to:')) {
            return 'Отлично! Это уточняющий вопрос. В демо-режиме я понимаю контекст предыдущих вопросов и могу дать связанные ответы.\n\n' + this.demoResponses.default;
        }

        return this.demoResponses.default;
    }

    getDemoQuestions() {
        return [
            'Что такое REST API?',
            'Как реализовать кеширование в Redis для микросервисной архитектуры?',
            'Объясни архитектуру микросервисов',
            'А что насчет безопасности?',
            'Что такое Docker контейнеры?'
        ];
    }
}

// Глобальный экземпляр для использования
window.demoMode = new DemoMode();