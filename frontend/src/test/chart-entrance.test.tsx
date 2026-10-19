import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GaugeChart } from '../components/dashboard/GaugeChart';

// A fake clock drives the animation frames, so the test doesn't depend on real timing.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
});

const readout = () => screen.getByText(/^\d+%$/, { selector: 'strong' }).textContent;

describe('chart entrance animation', () => {
  it('counts the gauge up from zero to its value, while exposing the real value at once', () => {
    render(<GaugeChart value={75} label="Today's progress" detail="3 of 4 done" />);
    const gauge = screen.getByRole('meter', { name: "Today's progress" });

    // Assistive tech gets the real value immediately; only the visuals animate.
    expect(gauge).toHaveAttribute('aria-valuenow', '75');
    expect(readout()).toBe('0%');

    act(() => void vi.advanceTimersByTime(300));
    const midway = Number.parseInt(readout() ?? '', 10);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(75);

    act(() => void vi.advanceTimersByTime(1000));
    expect(readout()).toBe('75%');
  });
});
