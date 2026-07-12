const MILLISECONDS_PER_MINUTE = 60_000;

export class InvalidAppointmentIntervalError extends Error {
  constructor() {
    super('Appointment interval is invalid');
    this.name = InvalidAppointmentIntervalError.name;
  }
}

export class AppointmentInterval {
  private constructor(
    private readonly startTimestamp: number,
    private readonly endTimestamp: number,
  ) {}

  static create(start: Date, durationMinutes: number): AppointmentInterval {
    const startTimestamp = start.getTime();

    if (
      !Number.isFinite(startTimestamp) ||
      !Number.isSafeInteger(durationMinutes) ||
      durationMinutes <= 0
    ) {
      throw new InvalidAppointmentIntervalError();
    }

    const durationMilliseconds = durationMinutes * MILLISECONDS_PER_MINUTE;
    const endTimestamp = startTimestamp + durationMilliseconds;

    if (
      !Number.isSafeInteger(durationMilliseconds) ||
      !Number.isFinite(new Date(endTimestamp).getTime())
    ) {
      throw new InvalidAppointmentIntervalError();
    }

    return new AppointmentInterval(startTimestamp, endTimestamp);
  }

  get start(): Date {
    return new Date(this.startTimestamp);
  }

  get end(): Date {
    return new Date(this.endTimestamp);
  }

  overlaps(other: AppointmentInterval): boolean {
    return (
      this.startTimestamp < other.endTimestamp &&
      other.startTimestamp < this.endTimestamp
    );
  }
}
