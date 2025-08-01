# 🎤 Быстрый запуск Audio Mixer для интервью

## ✅ Система готова к использованию!

Аудио миксер для технических интервью успешно настроен и включает:

### 🔧 Компоненты системы

1. **Audio Mixer** - Центральная панель управления
2. **Audio Capture** - Захват аудио с устройств  
3. **Teleprompter** - AI помощник с ответами
4. **WebSocket сервер** - Реальное время коммуникации

### 🚀 Запуск системы

```bash
# 1. Установка зависимостей (уже выполнено)
npm install

# 2. Запуск сервера
npm start

# 3. Откройте браузер
# http://localhost:3000
```

### 📱 Веб-интерфейсы

| URL | Описание |
|-----|----------|
| `http://localhost:3000/` | 🏠 Главная страница с навигацией |
| `http://localhost:3000/audio-mixer.html` | 🎛️ Audio Mixer (мониторинг P1/P2) |
| `http://localhost:3000/audio-capture.html` | 🎙️ Audio Capture (захват аудио) |
| `http://localhost:3000/teleprompter.html` | 📋 Teleprompter (AI ответы) |

### 🎯 Пошаговое использование

#### Шаг 1: Настройка VB Cable
1. Установите VB-Audio Cable
2. В Zoom/Google Meet выберите "CABLE Input" как устройство воспроизведения
3. Аудио интервьюера будет перенаправлено в VB Cable

#### Шаг 2: Запуск захвата
1. Откройте `http://localhost:3000/audio-capture.html`
2. Разрешите доступ к микрофону
3. Убедитесь, что VB Cable определился (красный бейдж)
4. Нажмите "Начать захват"

#### Шаг 3: Мониторинг
1. Откройте `http://localhost:3000/audio-mixer.html` в новой вкладке
2. Наблюдайте уровни аудио:
   - **P1 (красный)**: Интервьюер через VB Cable
   - **P2 (зеленый)**: Вы через микрофон

#### Шаг 4: AI помощь
1. Настройте OpenAI API ключ в `.env`:
   ```env
   OPENAI_API_KEY=sk-your-key-here
   ```
2. Откройте телепромптер для получения подсказок

### 🔍 Проверка статуса

**Сервер работает**: ✅ 
```json
{"status":"ok","timestamp":"2025-07-19T10:57:54.624Z","cache_size":0}
```

**Аудио API активен**: ✅
```json
{"isRecording":false,"connectedClients":0,"person1Active":false,"person2Active":false}
```

### 🎮 Тестирование

1. **Тест подключения**: Откройте главную страницу - статусы должны быть зелеными
2. **Тест аудио**: В Audio Capture нажмите "Тест P1" и "Тест P2"
3. **Тест VB Cable**: Включите аудио в Zoom и проверьте уровни в Audio Mixer

### 🛠️ API Endpoints

| Method | URL | Описание |
|--------|-----|----------|
| GET | `/api/health` | Здоровье сервера |
| GET | `/api/audio/status` | Статус аудио миксера |
| POST | `/api/audio/start` | Начать запись |
| POST | `/api/audio/stop` | Остановить запись |
| POST | `/api/audio/upload/p1` | Загрузка аудио P1 (VB Cable) |
| POST | `/api/audio/upload/p2` | Загрузка аудио P2 (микрофон) |

### 🌐 WebSocket События

```javascript
// Подключение к миксеру
const ws = new WebSocket('ws://localhost:3000');

// Типы событий
{
  type: 'set-person',        // Установка типа клиента
  type: 'audio-chunk',       // Аудио данные
  type: 'start-recording',   // Начать запись
  type: 'stop-recording',    // Остановить запись
  type: 'audio-processed'    // Обработанное аудио
}
```

### 🎯 Архитектура потоков

```
Zoom/Meet (P1) → VB Cable → Audio Capture → Server → Audio Mixer
                                              ↓
Микрофон (P2) → Audio Capture → Server → Audio Mixer
                                              ↓
                                         AI Assistant → Teleprompter
```

### ⚠️ Решение проблем

**VB Cable не определяется:**
- Убедитесь, что драйвер установлен
- Перезагрузите компьютер после установки
- Проверьте в "Audio Capture" → "Доступные устройства"

**Нет доступа к микрофону:**
- Разрешите доступ в браузере
- Проверьте настройки приватности системы
- Используйте HTTPS для production

**WebSocket не подключается:**
- Проверьте, что сервер запущен (`npm start`)
- Убедитесь, что порт 3000 не занят
- Отключите блокировщики рекламы

### 📊 Производительность

- **CPU**: Средняя нагрузка для обработки аудио
- **Memory**: ~50-100MB для Node.js сервера
- **Network**: WebSocket + HTTP API
- **Audio**: 1-секундные чанки, Opus кодек

### 🔐 Безопасность

- ✅ Локальная обработка аудио
- ✅ API ключи в переменных окружения
- ✅ Нет постоянного хранения аудио
- ✅ CORS настроен для разработки

### 📝 Что дальше?

1. **Настройте OpenAI API** для получения AI ответов
2. **Протестируйте с реальным интервью** в Zoom/Google Meet
3. **Расширьте функциональность** добавив Speech-to-Text
4. **Интегрируйте с другими AI моделями** (Claude, GPT-4)

---

**🎉 Система готова к использованию! Успешных интервью!**

---

*Для подробной документации см. `README_AUDIO_MIXER.md`*