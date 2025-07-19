/**
 * Audio Capture Module for Interview Assistant
 * Captures audio from VB Cable (P1) and Microphone (P2)
 */

class AudioCapture {
    constructor() {
        this.isCapturing = false;
        this.ws = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.micStream = null;
        this.vbCableStream = null;
        this.recordingChunks = [];
        
        // Audio processing parameters
        this.chunkDuration = 1000; // 1 second chunks
        this.sampleRate = 44100;
        
        // Audio level analysis
        this.p1Analyser = null;
        this.p2Analyser = null;
        this.p1DataArray = null;
        this.p2DataArray = null;
        this.currentLevels = { p1: 0, p2: 0 };
        
        this.initializeWebSocket();
    }

    async initializeWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('Audio capture connected to server');
            this.ws.send(JSON.stringify({ type: 'set-person', person: 'capture-client' }));
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };
        
        this.ws.onclose = () => {
            console.log('Audio capture disconnected from server');
            setTimeout(() => this.initializeWebSocket(), 3000);
        };
    }

    handleServerMessage(data) {
        switch (data.type) {
            case 'recording-started':
                this.startCapture();
                break;
            case 'recording-stopped':
                this.stopCapture();
                break;
        }
    }

    async startCapture() {
        if (this.isCapturing) return;
        
        try {
            this.isCapturing = true;
            console.log('Starting audio capture...');
            
            // Start microphone capture (P2)
            await this.startMicrophoneCapture();
            
            // Start VB Cable capture (P1) - if available
            await this.startVBCableCapture();
            
            console.log('Audio capture started successfully');
        } catch (error) {
            console.error('Error starting audio capture:', error);
            this.isCapturing = false;
        }
    }

    async startMicrophoneCapture() {
        try {
            // Request microphone access
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: this.sampleRate,
                    channelCount: 1
                }
            });

            this.setupAudioRecording(this.micStream, 'P2');
            console.log('Microphone capture started (P2)');
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            throw error;
        }
    }

    async startVBCableCapture() {
        try {
            console.log('Начинаю поиск VB Cable устройства...');
            
            // Try to get VB Cable device
            const devices = await navigator.mediaDevices.enumerateDevices();
            console.log('Найдено аудио устройств:', devices.length);
            
            // Log all audio input devices for debugging
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            console.log('Аудио входные устройства:');
            audioInputs.forEach((device, index) => {
                console.log(`${index + 1}. ${device.label} (ID: ${device.deviceId.substring(0, 20)}...)`);
            });
            
            // Enhanced VB Cable detection
            const vbCableDevice = devices.find(device => 
                device.kind === 'audioinput' && 
                (device.label.toLowerCase().includes('cable') || 
                 device.label.toLowerCase().includes('vb-audio') ||
                 device.label.toLowerCase().includes('vb cable') ||
                 device.label.toLowerCase().includes('vbcable') ||
                 device.label.toLowerCase().includes('virtual audio cable'))
            );

            if (vbCableDevice) {
                console.log(`Найдено VB Cable устройство: ${vbCableDevice.label}`);
                
                const constraints = {
                    audio: {
                        deviceId: { exact: vbCableDevice.deviceId },
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        sampleRate: this.sampleRate,
                        channelCount: 1
                    }
                };
                
                console.log('Попытка получить доступ к VB Cable с настройками:', constraints);
                
                this.vbCableStream = await navigator.mediaDevices.getUserMedia(constraints);

                // Test the stream
                const tracks = this.vbCableStream.getAudioTracks();
                if (tracks.length > 0) {
                    const track = tracks[0];
                    console.log('VB Cable трек получен:');
                    console.log('- Label:', track.label);
                    console.log('- Enabled:', track.enabled);
                    console.log('- Ready State:', track.readyState);
                    console.log('- Settings:', track.getSettings());
                    
                    // Check if track is actually receiving audio
                    const trackSettings = track.getSettings();
                    if (trackSettings.sampleRate) {
                        console.log(`VB Cable сконфигурирован: ${trackSettings.sampleRate}Hz, ${trackSettings.channelCount} каналов`);
                    }
                }

                this.setupAudioRecording(this.vbCableStream, 'P1');
                console.log('VB Cable capture started (P1)');
                
                // Add a test to see if we're actually getting audio data
                setTimeout(() => this.testVBCableAudio(), 2000);
                
            } else {
                console.warn('VB Cable устройство не найдено');
                console.warn('Доступные аудио устройства:');
                audioInputs.forEach(device => {
                    console.warn(`- ${device.label}`);
                });
                
                // Try alternative approach - look for any device that might be VB Cable
                const possibleVBDevices = audioInputs.filter(device => 
                    device.label.toLowerCase().includes('line') ||
                    device.label.toLowerCase().includes('stereo') ||
                    device.deviceId !== 'default'
                );
                
                if (possibleVBDevices.length > 0) {
                    console.warn('Возможные VB Cable кандидаты:');
                    possibleVBDevices.forEach(device => {
                        console.warn(`- ${device.label} (ID: ${device.deviceId.substring(0, 20)}...)`);
                    });
                }
            }
        } catch (error) {
            console.error('Ошибка доступа к VB Cable:', error);
            console.error('Детали ошибки:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            // Don't throw - continue with just microphone
            this.showVBCableError(error);
        }
    }

    testVBCableAudio() {
        if (!this.vbCableStream || !this.p1Analyser) {
            console.warn('VB Cable поток или анализатор недоступен для тестирования');
            return;
        }
        
        console.log('Тестирование аудио потока VB Cable...');
        
        let testDuration = 5000; // 5 seconds
        let sampleCount = 0;
        let totalLevel = 0;
        let maxLevel = 0;
        
        const testInterval = setInterval(() => {
            if (this.p1Analyser && this.p1DataArray) {
                this.p1Analyser.getByteTimeDomainData(this.p1DataArray);
                let sum = 0;
                for (let i = 0; i < this.p1DataArray.length; i++) {
                    const sample = (this.p1DataArray[i] - 128) / 128;
                    sum += sample * sample;
                }
                const rms = Math.sqrt(sum / this.p1DataArray.length);
                const level = rms * 100;
                
                totalLevel += level;
                sampleCount++;
                maxLevel = Math.max(maxLevel, level);
            }
        }, 100);
        
        setTimeout(() => {
            clearInterval(testInterval);
            const avgLevel = sampleCount > 0 ? totalLevel / sampleCount : 0;
            
            console.log('Результаты теста VB Cable:');
            console.log(`- Средний уровень: ${avgLevel.toFixed(2)}%`);
            console.log(`- Максимальный уровень: ${maxLevel.toFixed(2)}%`);
            console.log(`- Количество образцов: ${sampleCount}`);
            
            if (maxLevel < 1) {
                console.warn('⚠️ VB Cable может не получать аудио сигнал');
                console.warn('Проверьте:');
                console.warn('1. VB Cable настроен как устройство воспроизведения в приложении');
                console.warn('2. VB Cable установлен и работает');
                console.warn('3. Аудио играет в источнике (Zoom/Google Meet)');
            } else if (maxLevel > 1) {
                console.log('✅ VB Cable получает аудио сигнал');
            }
        }, testDuration);
    }

    showVBCableError(error) {
        // Create error notification in UI if possible
        if (typeof window !== 'undefined' && window.showNotification) {
            window.showNotification('Ошибка VB Cable: ' + error.message, 'error');
        }
        
        // Log detailed troubleshooting info
        console.group('🔧 Диагностика VB Cable');
        console.error('Ошибка:', error.message);
        console.log('Возможные причины:');
        console.log('1. VB Cable не установлен');
        console.log('2. VB Cable не настроен как устройство ввода');
        console.log('3. Нет разрешения на доступ к микрофону');
        console.log('4. VB Cable не выбран в настройках системы');
        console.log('');
        console.log('Решения:');
        console.log('1. Установите VB Cable с официального сайта');
        console.log('2. Настройте VB Cable как устройство воспроизведения в источнике аудио');
        console.log('3. Дайте разрешение на доступ к микрофону в браузере');
        console.log('4. Проверьте настройки звука в системе');
        console.groupEnd();
    }

    setupAudioRecording(stream, personType) {
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus'
        });

        // Setup audio analysis for level meters
        this.setupAudioAnalysis(stream, personType);

        const chunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            if (chunks.length > 0) {
                const audioBlob = new Blob(chunks, { type: 'audio/webm' });
                this.sendAudioChunk(audioBlob, personType);
                chunks.length = 0; // Clear chunks
            }
        };

        // Record in chunks
        mediaRecorder.start();
        
        const recordingInterval = setInterval(() => {
            if (this.isCapturing && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                mediaRecorder.start();
            } else {
                clearInterval(recordingInterval);
            }
        }, this.chunkDuration);

        // Store recorder reference
        if (personType === 'P1') {
            this.vbCableRecorder = { mediaRecorder, interval: recordingInterval };
        } else {
            this.micRecorder = { mediaRecorder, interval: recordingInterval };
        }
    }

    async sendAudioChunk(audioBlob, personType) {
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, `audio_${personType}_${Date.now()}.webm`);

            const endpoint = personType === 'P1' ? '/api/audio/upload/p1' : '/api/audio/upload/p2';
            
            const response = await fetch(endpoint, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`Audio chunk sent for ${personType}:`, result);

        } catch (error) {
            console.error(`Error sending audio chunk for ${personType}:`, error);
        }
    }

    stopCapture() {
        if (!this.isCapturing) return;
        
        this.isCapturing = false;
        console.log('Stopping audio capture...');

        // Stop microphone recording
        if (this.micRecorder) {
            this.micRecorder.mediaRecorder.stop();
            clearInterval(this.micRecorder.interval);
            this.micRecorder = null;
        }

        // Stop VB Cable recording
        if (this.vbCableRecorder) {
            this.vbCableRecorder.mediaRecorder.stop();
            clearInterval(this.vbCableRecorder.interval);
            this.vbCableRecorder = null;
        }

        // Stop streams
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }

        if (this.vbCableStream) {
            this.vbCableStream.getTracks().forEach(track => track.stop());
            this.vbCableStream = null;
        }

        // Cleanup audio analysis
        this.p1Analyser = null;
        this.p2Analyser = null;
        this.p1DataArray = null;
        this.p2DataArray = null;
        this.currentLevels = { p1: 0, p2: 0 };

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }

        console.log('Audio capture stopped');
    }

    // Get available audio devices
    async getAudioDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            
            return audioInputs.map(device => ({
                deviceId: device.deviceId,
                label: device.label || 'Unknown Device',
                isVBCable: device.label.toLowerCase().includes('cable') || 
                          device.label.toLowerCase().includes('vb-audio')
            }));
        } catch (error) {
            console.error('Error getting audio devices:', error);
            return [];
        }
    }

    // Test audio input
    async testAudioInput(deviceId) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: deviceId,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            // Create audio context to analyze the stream
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            return new Promise((resolve) => {
                let maxVolume = 0;
                let sampleCount = 0;
                
                const checkAudio = () => {
                    analyser.getByteFrequencyData(dataArray);
                    const volume = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
                    maxVolume = Math.max(maxVolume, volume);
                    sampleCount++;
                    
                    if (sampleCount < 50) { // Sample for ~1 second
                        requestAnimationFrame(checkAudio);
                    } else {
                        stream.getTracks().forEach(track => track.stop());
                        audioContext.close();
                        resolve({
                            deviceId,
                            maxVolume,
                            hasSignal: maxVolume > 5
                        });
                    }
                };
                
                checkAudio();
            });
        } catch (error) {
            console.error('Error testing audio input:', error);
            return { deviceId, error: error.message };
        }
    }

    // Manual audio chunk sending for testing
    async sendTestChunk(personType) {
        try {
            // Create a simple test audio blob
            const audioContext = new AudioContext();
            const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.5, audioContext.sampleRate);
            const channelData = buffer.getChannelData(0);
            
            // Generate a simple tone
            for (let i = 0; i < channelData.length; i++) {
                channelData[i] = Math.sin(2 * Math.PI * 440 * i / audioContext.sampleRate) * 0.3;
            }
            
            // Convert to blob (simplified - in real app you'd need proper encoding)
            const testBlob = new Blob(['test audio data'], { type: 'audio/webm' });
            
            await this.sendAudioChunk(testBlob, personType);
            console.log(`Test chunk sent for ${personType}`);
            
        } catch (error) {
            console.error(`Error sending test chunk for ${personType}:`, error);
        }
    }

    setupAudioAnalysis(stream, personType) {
        try {
            if (!this.audioContext) {
                this.audioContext = new AudioContext();
            }

            const source = this.audioContext.createMediaStreamSource(stream);
            const analyser = this.audioContext.createAnalyser();
            
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            if (personType === 'P1') {
                this.p1Analyser = analyser;
                this.p1DataArray = dataArray;
            } else {
                this.p2Analyser = analyser;
                this.p2DataArray = dataArray;
            }

            console.log(`Audio analysis setup for ${personType}`);
        } catch (error) {
            console.error(`Failed to setup audio analysis for ${personType}:`, error);
        }
    }

    getAudioLevels() {
        // Calculate P1 level using time domain data for better responsiveness
        if (this.p1Analyser && this.p1DataArray) {
            this.p1Analyser.getByteTimeDomainData(this.p1DataArray);
            let p1Sum = 0;
            for (let i = 0; i < this.p1DataArray.length; i++) {
                const sample = (this.p1DataArray[i] - 128) / 128;
                p1Sum += sample * sample;
            }
            const rms = Math.sqrt(p1Sum / this.p1DataArray.length);
            this.currentLevels.p1 = Math.min(100, rms * 200); // Scale for visibility
        }

        // Calculate P2 level using time domain data for better responsiveness
        if (this.p2Analyser && this.p2DataArray) {
            this.p2Analyser.getByteTimeDomainData(this.p2DataArray);
            let p2Sum = 0;
            for (let i = 0; i < this.p2DataArray.length; i++) {
                const sample = (this.p2DataArray[i] - 128) / 128;
                p2Sum += sample * sample;
            }
            const rms = Math.sqrt(p2Sum / this.p2DataArray.length);
            this.currentLevels.p2 = Math.min(100, rms * 200); // Scale for visibility
        }

        return this.currentLevels;
    }
}

// WebSocket-based audio chunk sender
class WebSocketAudioSender {
    constructor(audioCapture) {
        this.audioCapture = audioCapture;
    }

    sendAudioChunk(audioData, personType) {
        if (this.audioCapture.ws && this.audioCapture.ws.readyState === WebSocket.OPEN) {
            this.audioCapture.ws.send(JSON.stringify({
                type: 'audio-chunk',
                person: personType,
                audioData: audioData,
                timestamp: Date.now()
            }));
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioCapture, WebSocketAudioSender };
} else {
    window.AudioCapture = AudioCapture;
    window.WebSocketAudioSender = WebSocketAudioSender;
}