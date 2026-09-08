type LogContext = Record<string, unknown>;

export const appLogger = {
  error(message: string, context?: LogContext) {
    if (context) {
      console.error(`[MyPDFChat] ${message}`, context);
      return;
    }

    console.error(`[MyPDFChat] ${message}`);
  },
  warn(message: string, context?: LogContext) {
    if (context) {
      console.warn(`[MyPDFChat] ${message}`, context);
      return;
    }

    console.warn(`[MyPDFChat] ${message}`);
  }
};
