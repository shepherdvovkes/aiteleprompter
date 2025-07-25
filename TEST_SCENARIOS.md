# Тестовые сценарии для улучшенной системы

## 🧪 Тесты непрерывного прослушивания

### Тест 1: Составной технический вопрос
**Что говорить:**
1. "Как реализовать кеширование данных в Redis" (пауза 2 секунды)
2. "для высоконагруженного веб-приложения с микросервисной архитектурой?"

**Ожидаемое поведение:**
- Система показывает индикатор ожидания с таймером
- Через 3 секунды объединяет вопросы
- Дает ответ про Redis + микросервисы

### Тест 2: Короткий уточняющий вопрос  
**Что говорить:**
1. "Объясни архитектуру микросервисов" (дождаться ответа)
2. "А что насчет безопасности?"

**Ожидаемое поведение:**
- Первый вопрос обрабатывается сразу
- Второй помечается как "Follow-up" 🟠
- Ответ учитывает контекст микросервисов

### Тест 3: Немедленная обработка
**Что говорить:**
"Что такое Docker контейнеры?"

**Ожидаемое поведение:**
- Помечается как "Immediate" 🔵  
- Обрабатывается сразу без задержки
- Быстрый и точный ответ

## 🔧 Тесты автовосстановления

### Тест 4: Имитация сбоя сети
**Действия:**
1. Начать запись
2. Отключить интернет на 10 секунд
3. Включить обратно
4. Задать вопрос

**Ожидаемое поведение:**
- Система показывает "Network error - will retry"
- Автоматически переподключается
- Продолжает работу без потери данных

### Тест 5: Блокировка микрофона
**Действия:**
1. Начать запись  
2. Заблокировать доступ к микрофону в браузере
3. Разрешить доступ обратно

**Ожидаемое поведение:**
- Показывает "Microphone access denied"
- При разрешении автоматически возобновляет работу

## 📝 Тесты настроек

### Тест 6: Разные задержки
**Настройки:**
- Задержка: 1 секунда

**Что говорить:**
"Как работает HTTP" (пауза 2 секунды) "протокол?"

**Ожидаемое поведение:**
- Обрабатывает первую часть через 1 секунду
- Вторая часть создает новый вопрос

### Тест 7: Тематический контекст
**Настройки:**
- Тема: "JavaScript, React, Node.js"

**Что говорить:**
"Как оптимизировать производительность?"

**Ожидаемое поведение:**
- Ответ фокусируется на JS/React оптимизации
- Не общие советы по производительности

## 🎯 Тесты детекции типов вопросов

### Тест 8: Технические команды
**Примеры фраз:**
- "Напиши код для REST API"
- "Покажи реализацию binary search"  
- "Создай компонент React для формы"

**Ожидаемое поведение:**
- Высокий приоритет обработки
- Категория: "Technical"
- Подробные code examples в ответе

### Тест 9: Вопросы-продолжения
**Примеры фраз:**
- "А если использовать TypeScript?"
- "И что еще можно улучшить?"
- "Расскажи подробнее про это"

**Ожидаемое поведение:**
- Определяется связь с предыдущим вопросом
- Badge "Follow-up" 🟠
- Контекстный ответ

### Тест 10: Многоязычность
**Что говорить:**
- "What is the difference between var and let?"
- "Какая разница между Promise и async/await?"

**Ожидаемое поведение:**
- Корректная обработка обоих языков
- Ответы на соответствующем языке

## 🔍 Тесты граничных случаев

### Тест 11: Очень длинные вопросы
**Что говорить:**
Длинный технический вопрос из 5+ предложений с паузами

**Ожидаемое поведение:**
- Система буферизует до 5 предложений
- Объединяет в связный контекст
- Не теряет важные детали

### Тест 12: Быстрая речь без пауз
**Что говорить:**
Быстро без пауз: "Что такое REST API как его создать на Node.js?"

**Ожидаемое поведение:**
- Обрабатывается как один вопрос
- Корректное понимание всех частей

### Тест 13: Шепот и громкая речь
**Действия:**
1. Задать вопрос шепотом
2. Повторить громко

**Ожидаемое поведение:**
- Система адаптируется к громкости
- Качественное распознавание в обоих случаях

## ✅ Критерии успеха

### Производительность:
- [ ] Время отклика < 3 секунд
- [ ] Точность распознавания > 90%
- [ ] Переподключение < 5 секунд

### Функциональность:
- [ ] Составные вопросы объединяются
- [ ] Follow-up вопросы определяются  
- [ ] Настройки сохраняются
- [ ] Визуальные индикаторы работают

### Надежность:
- [ ] Нет потери данных при сбоях
- [ ] Автовосстановление работает
- [ ] Длительные сессии стабильны

## 🚨 Checklist перед продакшеном

- [ ] Все тесты пройдены
- [ ] API ключ настроен
- [ ] Микрофон работает  
- [ ] Интернет стабилен
- [ ] DevTools открыты для мониторинга