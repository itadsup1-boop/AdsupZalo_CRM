import { describe, expect, it } from 'vitest';
import scenarios from './fixtures/ai-customer-scenarios.json' assert { type: 'json' };

describe('AI customer scenario fixture', () => {
  it('contains at least 50 realistic scenarios with expected behavior', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(50);
    for (const scenario of scenarios) {
      expect(scenario.message.length).toBeGreaterThan(5);
      expect(scenario.group).toBeTruthy();
      expect(scenario.expected).toBeTruthy();
    }
  });

  it('covers required scenario groups', () => {
    const groups = new Set(scenarios.map((item) => item.group));
    for (const group of [
      'price', 'promotion', 'booking', 'reschedule', 'cancel', 'address',
      'working_hours', 'expert', 'process', 'pain', 'swelling', 'recovery',
      'warranty', 'comparison', 'skeptical', 'complaint', 'out_of_scope',
      'sensitive', 'spam', 'typo', 'multi_intent', 'ambiguous',
    ]) {
      expect(groups.has(group)).toBe(true);
    }
  });
});
