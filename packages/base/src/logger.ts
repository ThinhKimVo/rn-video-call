export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export class Logger implements ILogger {
  private static instances: Map<string, Logger> = new Map();
  private static globalLogLevel: LogLevel = LogLevel.INFO;
  private logLevel: LogLevel;
  private tag: string;

  constructor(tag: string = 'VideoCall') {
    this.tag = tag;
    this.logLevel = Logger.globalLogLevel;
  }

  /**
   * Get a logger instance for a specific tag.
   * Each tag gets its own logger instance with proper namespacing.
   */
  public static getInstance(tag: string = 'VideoCall'): Logger {
    if (!Logger.instances.has(tag)) {
      Logger.instances.set(tag, new Logger(tag));
    }
    return Logger.instances.get(tag)!;
  }

  /**
   * Set the global log level that applies to all new logger instances.
   */
  public static setGlobalLogLevel(level: LogLevel): void {
    Logger.globalLogLevel = level;
    // Update all existing instances
    for (const logger of Logger.instances.values()) {
      logger.logLevel = level;
    }
  }

  /**
   * Set log level for this specific logger instance.
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.tag}] [${level}] ${message}`;
  }

  public debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage('DEBUG', message), ...args);
    }
  }

  public info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', message), ...args);
    }
  }

  public warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message), ...args);
    }
  }

  public error(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message), ...args);
    }
  }
}
