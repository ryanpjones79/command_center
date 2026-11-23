// "1h 30m" style lengths, shared by server and client components.
export const fmtLength = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`);
