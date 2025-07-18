/**
 * UIManager handles all UI animations, visual effects, and enhanced UX features
 */
class UIManager {
    constructor() {
        this.animationQueue = [];
        this.isAnimating = false;
        this.initializeStyles();
    }

    initializeStyles() {
        // Add dynamic styles for animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            @keyframes fadeInLeft {
                from {
                    opacity: 0;
                    transform: translateX(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            @keyframes typewriter {
                from { width: 0; }
                to { width: 100%; }
            }

            @keyframes blink {
                0%, 50% { border-color: transparent; }
                51%, 100% { border-color: #3b82f6; }
            }

            @keyframes pulse-glow {
                0%, 100% { 
                    transform: scale(1);
                    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
                }
                50% { 
                    transform: scale(1.05);
                    box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
                }
            }

            @keyframes shimmer {
                0% { background-position: -200px 0; }
                100% { background-position: calc(200px + 100%) 0; }
            }

            .animate-fade-in-up {
                animation: fadeInUp 0.6s ease-out forwards;
            }

            .animate-fade-in-left {
                animation: fadeInLeft 0.5s ease-out forwards;
            }

            .animate-pulse-glow {
                animation: pulse-glow 2s infinite;
            }

            .typing-effect {
                overflow: hidden;
                border-right: 2px solid #3b82f6;
                white-space: nowrap;
                animation: typewriter 1.5s steps(40, end), blink 0.75s step-end infinite;
            }

            .shimmer-loading {
                background: linear-gradient(90deg, #374151 25%, #4b5563 50%, #374151 75%);
                background-size: 200px 100%;
                animation: shimmer 2s infinite;
            }

            .response-container {
                transition: all 0.3s ease;
            }

            .response-container:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
            }

            .regenerate-btn {
                opacity: 0;
                transition: all 0.3s ease;
                transform: scale(0.9);
            }

            .response-container:hover .regenerate-btn {
                opacity: 1;
                transform: scale(1);
            }

            .queue-indicator {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
                background: rgba(17, 24, 39, 0.9);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(59, 130, 246, 0.3);
                border-radius: 12px;
                padding: 12px 16px;
                color: #e5e7eb;
                font-size: 14px;
                transform: translateX(100%);
                transition: transform 0.3s ease;
            }

            .queue-indicator.show {
                transform: translateX(0);
            }

            .queue-dot {
                display: inline-block;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #3b82f6;
                margin: 0 2px;
                animation: pulse 1.5s infinite;
            }

            .queue-dot:nth-child(2) { animation-delay: 0.3s; }
            .queue-dot:nth-child(3) { animation-delay: 0.6s; }
        `;
        document.head.appendChild(style);
    }

    // Animate AI response appearance
    animateResponseAppearance(element, options = {}) {
        const {
            animationType = 'fadeInUp',
            delay = 0,
            duration = 600,
            callback = null
        } = options;

        element.style.opacity = '0';
        element.style.transform = animationType === 'fadeInUp' ? 'translateY(20px)' : 'translateX(-20px)';

        setTimeout(() => {
            element.classList.add(`animate-${animationType.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            element.style.opacity = '1';
            element.style.transform = 'none';

            if (callback) {
                setTimeout(callback, duration);
            }
        }, delay);
    }

    // Typewriter effect for text
    typewriterEffect(element, text, options = {}) {
        const {
            speed = 50,
            callback = null,
            showCursor = true
        } = options;

        element.textContent = '';
        if (showCursor) {
            element.classList.add('typing-effect');
        }

        let i = 0;
        const timer = setInterval(() => {
            element.textContent += text.charAt(i);
            i++;

            if (i > text.length) {
                clearInterval(timer);
                if (showCursor) {
                    setTimeout(() => {
                        element.classList.remove('typing-effect');
                    }, 1000);
                }
                if (callback) callback();
            }
        }, speed);

        return timer;
    }

    // Create response container with regenerate functionality
    createResponseContainer(question, response, responseId) {
        const container = document.createElement('div');
        container.className = 'response-container bg-gray-800/70 rounded-lg p-4 border border-gray-600 relative';
        container.dataset.responseId = responseId;

        // Question header
        const questionEl = document.createElement('div');
        questionEl.className = 'text-blue-400 font-semibold mb-3 text-sm';
        questionEl.textContent = `Q: ${question}`;

        // Response content
        const responseEl = document.createElement('div');
        responseEl.className = 'ai-response-content text-gray-200 prose prose-invert max-w-none';
        
        // Regenerate button
        const regenerateBtn = document.createElement('button');
        regenerateBtn.className = 'regenerate-btn absolute top-2 right-2 p-2 text-gray-400 hover:text-blue-400 transition-colors rounded-md hover:bg-gray-700';
        regenerateBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
        `;
        regenerateBtn.title = 'Regenerate response';

        container.appendChild(questionEl);
        container.appendChild(responseEl);
        container.appendChild(regenerateBtn);

        // Add animation
        this.animateResponseAppearance(container);

        // Animate response text with typewriter effect if short enough
        if (response.length < 200) {
            this.typewriterEffect(responseEl, response, {
                speed: 30,
                showCursor: false
            });
        } else {
            // For longer responses, use markdown rendering
            this.renderMarkdownContent(responseEl, response);
        }

        return { container, regenerateBtn, responseEl };
    }

    // Render markdown content with syntax highlighting
    renderMarkdownContent(element, content) {
        element.innerHTML = content;
        
        // Process code blocks
        element.querySelectorAll('pre code').forEach(block => {
            if (typeof hljs !== 'undefined') {
                hljs.highlightElement(block);
            }
        });

        // Process math expressions
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(element, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\[', right: '\\]', display: true},
                    {left: '\\(', right: '\\)', display: false}
                ]
            });
        }
    }

    // Show queue processing indicator
    showQueueIndicator(queueLength) {
        let indicator = document.getElementById('queue-indicator');
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'queue-indicator';
            indicator.className = 'queue-indicator';
            document.body.appendChild(indicator);
        }

        indicator.innerHTML = `
            <div class="flex items-center space-x-2">
                <div class="flex">
                    <div class="queue-dot"></div>
                    <div class="queue-dot"></div>
                    <div class="queue-dot"></div>
                </div>
                <span>Processing ${queueLength} item${queueLength > 1 ? 's' : ''}</span>
            </div>
        `;

        indicator.classList.add('show');
    }

    // Hide queue processing indicator
    hideQueueIndicator() {
        const indicator = document.getElementById('queue-indicator');
        if (indicator) {
            indicator.classList.remove('show');
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 300);
        }
    }

    // Show loading skeleton for responses
    showLoadingSkeleton(container) {
        const skeleton = document.createElement('div');
        skeleton.className = 'loading-skeleton space-y-3';
        skeleton.innerHTML = `
            <div class="shimmer-loading h-4 rounded w-3/4"></div>
            <div class="shimmer-loading h-4 rounded w-1/2"></div>
            <div class="shimmer-loading h-4 rounded w-5/6"></div>
        `;
        
        container.appendChild(skeleton);
        return skeleton;
    }

    // Remove loading skeleton
    removeLoadingSkeleton(skeleton) {
        if (skeleton && skeleton.parentNode) {
            skeleton.parentNode.removeChild(skeleton);
        }
    }

    // Animate transcript entry
    animateTranscriptEntry(element) {
        element.style.opacity = '0';
        element.style.transform = 'translateX(-20px)';
        
        setTimeout(() => {
            element.style.transition = 'all 0.4s ease';
            element.style.opacity = '1';
            element.style.transform = 'translateX(0)';
        }, 50);
    }

    // Highlight detected questions
    highlightQuestion(element) {
        element.classList.add('animate-pulse-glow');
        setTimeout(() => {
            element.classList.remove('animate-pulse-glow');
        }, 2000);
    }

    // Show success message
    showSuccessMessage(message, duration = 3000) {
        this.showToast(message, 'success', duration);
    }

    // Show error message
    showErrorMessage(message, duration = 5000) {
        this.showToast(message, 'error', duration);
    }

    // Show info message
    showInfoMessage(message, duration = 4000) {
        this.showToast(message, 'info', duration);
    }

    // Generic toast notification
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        const colors = {
            success: 'bg-green-600 border-green-500',
            error: 'bg-red-600 border-red-500',
            info: 'bg-blue-600 border-blue-500',
            warning: 'bg-yellow-600 border-yellow-500'
        };

        toast.className = `fixed top-4 left-1/2 transform -translate-x-1/2 ${colors[type]} text-white px-6 py-3 rounded-lg border z-50 shadow-lg transition-all duration-300`;
        toast.style.transform = 'translate(-50%, -100px)';
        toast.textContent = message;

        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translate(-50%, 0)';
        }, 100);

        // Animate out
        setTimeout(() => {
            toast.style.transform = 'translate(-50%, -100px)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }

    // Smooth scroll to element
    smoothScrollTo(element, offset = 0) {
        const elementPosition = element.offsetTop - offset;
        const startPosition = window.pageYOffset;
        const distance = elementPosition - startPosition;
        const duration = 800;
        let start = null;

        function animation(currentTime) {
            if (start === null) start = currentTime;
            const timeElapsed = currentTime - start;
            const run = ease(timeElapsed, startPosition, distance, duration);
            window.scrollTo(0, run);
            if (timeElapsed < duration) requestAnimationFrame(animation);
        }

        function ease(t, b, c, d) {
            t /= d / 2;
            if (t < 1) return c / 2 * t * t + b;
            t--;
            return -c / 2 * (t * (t - 2) - 1) + b;
        }

        requestAnimationFrame(animation);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}