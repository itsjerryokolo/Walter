export interface CircuitBreakerConfig {
  failureThreshold: number // Number of failures before opening
  successThreshold: number // Number of successes to close
  timeout: number // Time in ms to wait before half-open
}

type CircuitState = "closed" | "open" | "half-open"

/**
 * Circuit breaker for resilient sub-agent communication
 */
export class CircuitBreaker {
  private state: CircuitState = "closed"
  private failures: number = 0
  private successes: number = 0
  private lastFailure: Date | null = null
  private config: CircuitBreakerConfig

  constructor(
    private name: string,
    config?: Partial<CircuitBreakerConfig>
  ) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      successThreshold: config?.successThreshold ?? 2,
      timeout: config?.timeout ?? 30000,
    }
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === "open" && this.shouldAttemptReset()) {
      this.state = "half-open"
      console.log(`[CircuitBreaker:${this.name}] State: half-open (attempting reset)`)
    }

    // Reject if circuit is open
    if (this.state === "open") {
      throw new CircuitOpenError(this.name, this.getTimeUntilReset())
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  /**
   * Record a successful operation
   */
  private onSuccess(): void {
    this.failures = 0

    if (this.state === "half-open") {
      this.successes++
      if (this.successes >= this.config.successThreshold) {
        this.state = "closed"
        this.successes = 0
        console.log(`[CircuitBreaker:${this.name}] State: closed (reset successful)`)
      }
    }
  }

  /**
   * Record a failed operation
   */
  private onFailure(): void {
    this.failures++
    this.lastFailure = new Date()
    this.successes = 0

    if (this.state === "half-open") {
      this.state = "open"
      console.log(`[CircuitBreaker:${this.name}] State: open (half-open failure)`)
    } else if (
      this.state === "closed" &&
      this.failures >= this.config.failureThreshold
    ) {
      this.state = "open"
      console.log(
        `[CircuitBreaker:${this.name}] State: open (failure threshold reached)`
      )
    }
  }

  /**
   * Check if we should attempt to reset the circuit
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailure) return true
    const elapsed = Date.now() - this.lastFailure.getTime()
    return elapsed >= this.config.timeout
  }

  /**
   * Get time until circuit might reset
   */
  private getTimeUntilReset(): number {
    if (!this.lastFailure) return 0
    const elapsed = Date.now() - this.lastFailure.getTime()
    return Math.max(0, this.config.timeout - elapsed)
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState
    failures: number
    successes: number
    lastFailure: Date | null
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
    }
  }

  /**
   * Manually reset the circuit (for testing/admin)
   */
  reset(): void {
    this.state = "closed"
    this.failures = 0
    this.successes = 0
    this.lastFailure = null
    console.log(`[CircuitBreaker:${this.name}] Manually reset`)
  }
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(
    public circuitName: string,
    public retryAfterMs: number
  ) {
    super(
      `Circuit breaker '${circuitName}' is open. Retry after ${Math.ceil(retryAfterMs / 1000)}s`
    )
    this.name = "CircuitOpenError"
  }
}
