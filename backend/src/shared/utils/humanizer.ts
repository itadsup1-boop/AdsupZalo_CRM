import { logger } from '../utils/logger.js';

/**
 * Humanizer: Giả lập hành vi người dùng tự nhiên
 */
export const humanizer = {
  // 5.1 Random Click/Action Delay
  async wait(min = 500, max = 2000) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, delay));
  },

  // 5.1 Natural Typing Delay (Giả lập tốc độ gõ phím)
  async typingDelay(textLength: number) {
    const msPerChar = Math.floor(Math.random() * 50) + 100; // 100-150ms mỗi ký tự
    const totalDelay = textLength * msPerChar;
    logger.debug(`[humanizer] Typing delay: ${totalDelay}ms for ${textLength} chars`);
    return this.wait(totalDelay, totalDelay + 1000);
  },

  // 5.1 Natural Scroll Jitter
  async naturalScroll(page: any, targetSelector: string) {
    await page.evaluate(async (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return;
      
      const targetScroll = Math.floor(Math.random() * 500) + 200;
      let currentScroll = 0;
      
      while (currentScroll < targetScroll) {
        const step = Math.floor(Math.random() * 50) + 10;
        el.scrollTop += step;
        currentScroll += step;
        await new Promise(r => setTimeout(r, Math.random() * 100 + 50));
      }
    }, targetSelector);
  }
};

// 5.2 Rate Limiter (Max 20 sends / minute)
export class RateLimiter {
  private history: number[] = [];
  private maxPerMinute: number;

  constructor(maxPerMinute = 20) {
    this.maxPerMinute = maxPerMinute;
  }

  canExecute(): boolean {
    const now = Date.now();
    this.history = this.history.filter(ts => now - ts < 60000);
    return this.history.length < this.maxPerMinute;
  }

  record() {
    this.history.push(Date.now());
  }
}
