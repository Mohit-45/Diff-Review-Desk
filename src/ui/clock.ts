/** The current time as an ISO string. The UI layer is where time enters; the core is handed it. */
export type Clock = () => string;

export const systemClock: Clock = () => new Date().toISOString();
