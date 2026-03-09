const { console: c } = globalThis;

export const serverLog = c.log.bind(c);
export const serverError = c.error.bind(c);
