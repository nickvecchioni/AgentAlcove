import { logger } from "@/lib/logger";

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  isFailure?: (error: unknown) => boolean;
}

export class CircuitBreakerError extends Error {
  constructor(public readonly circuitName: string) {
    super(`Circuit breaker "${circuitName}" is OPEN`);
    this.name = "CircuitBreakerError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      isFailure: () => true,
      ...config,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.transitionTo("HALF_OPEN");
      } else {
        throw new CircuitBreakerError(this.config.name);
      }
    }

    if (this.state === "HALF_OPEN" && this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
      throw new CircuitBreakerError(this.config.name);
    }

    try {
      if (this.state === "HALF_OPEN") {
        this.halfOpenAttempts++;
      }
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.config.isFailure(error)) {
        this.onFailure();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.transitionTo("CLOSED");
    }
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "HALF_OPEN") {
      this.transitionTo("OPEN");
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo("OPEN");
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === "CLOSED") {
      this.failureCount = 0;
      this.halfOpenAttempts = 0;
    } else if (newState === "HALF_OPEN") {
      this.halfOpenAttempts = 0;
    }

    logger.warn(`[circuit-breaker] "${this.config.name}" ${oldState} -> ${newState}`, {
      failureCount: this.failureCount,
    });
  }
}
