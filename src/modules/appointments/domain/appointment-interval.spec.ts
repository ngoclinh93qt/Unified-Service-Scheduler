import {
  AppointmentInterval,
  InvalidAppointmentIntervalError,
} from './appointment-interval';

describe('AppointmentInterval', () => {
  const at = (value: string) => new Date(value);

  it('derives the end instant from duration minutes', () => {
    const interval = AppointmentInterval.create(
      at('2026-07-13T08:00:00.000Z'),
      60,
    );

    expect(interval.end.toISOString()).toBe('2026-07-13T09:00:00.000Z');
  });

  it('detects partially overlapping intervals', () => {
    const first = AppointmentInterval.create(at('2026-07-13T08:00:00Z'), 60);
    const second = AppointmentInterval.create(at('2026-07-13T08:30:00Z'), 60);

    expect(first.overlaps(second)).toBe(true);
    expect(second.overlaps(first)).toBe(true);
  });

  it('detects an interval contained within another', () => {
    const outer = AppointmentInterval.create(at('2026-07-13T08:00:00Z'), 120);
    const inner = AppointmentInterval.create(at('2026-07-13T08:30:00Z'), 30);

    expect(outer.overlaps(inner)).toBe(true);
    expect(inner.overlaps(outer)).toBe(true);
  });

  it('treats touching half-open intervals as non-overlapping', () => {
    const first = AppointmentInterval.create(at('2026-07-13T08:00:00Z'), 60);
    const second = AppointmentInterval.create(at('2026-07-13T09:00:00Z'), 30);

    expect(first.overlaps(second)).toBe(false);
    expect(second.overlaps(first)).toBe(false);
  });

  it('treats separated intervals as non-overlapping', () => {
    const first = AppointmentInterval.create(at('2026-07-13T08:00:00Z'), 30);
    const second = AppointmentInterval.create(at('2026-07-13T09:00:00Z'), 30);

    expect(first.overlaps(second)).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects duration %p',
    (duration) => {
      expect(() =>
        AppointmentInterval.create(at('2026-07-13T08:00:00Z'), duration),
      ).toThrow(InvalidAppointmentIntervalError);
    },
  );

  it('rejects an invalid start date', () => {
    expect(() => AppointmentInterval.create(new Date('invalid'), 60)).toThrow(
      InvalidAppointmentIntervalError,
    );
  });

  it('rejects a duration that produces an invalid end date', () => {
    expect(() =>
      AppointmentInterval.create(new Date(8_640_000_000_000_000), 1),
    ).toThrow(InvalidAppointmentIntervalError);
  });

  it('protects its dates from external mutation', () => {
    const start = at('2026-07-13T08:00:00Z');
    const interval = AppointmentInterval.create(start, 60);

    start.setUTCFullYear(2030);
    interval.start.setUTCFullYear(2031);
    interval.end.setUTCFullYear(2032);

    expect(interval.start.toISOString()).toBe('2026-07-13T08:00:00.000Z');
    expect(interval.end.toISOString()).toBe('2026-07-13T09:00:00.000Z');
  });
});
