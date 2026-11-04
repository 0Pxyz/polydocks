/**
 * Secret Redaction Utility for Polydocks Capability Bus.
 * Ensures canary secrets, credentials, and API keys are automatically redacted
 * and never leak into execution logs, SSE streams, prompts, or error stacks.
 */

class SecretRedactor {
  private static instance: SecretRedactor | null = null;
  private knownSecrets = new Set<string>();

  public static getInstance(): SecretRedactor {
    if (!SecretRedactor.instance) {
      SecretRedactor.instance = new SecretRedactor();
    }
    return SecretRedactor.instance;
  }

  /**
   * Register a secret value to be redacted across all outputs.
   */
  public register(secret: string): void {
    if (secret && typeof secret === "string" && secret.trim().length >= 3) {
      this.knownSecrets.add(secret.trim());
    }
  }

  /**
   * Clear registered secrets (useful in tests).
   */
  public clear(): void {
    this.knownSecrets.clear();
  }

  /**
   * Get all registered secrets.
   */
  public getSecrets(): string[] {
    return Array.from(this.knownSecrets);
  }

  /**
   * Redact secrets from text or complex data structures recursively.
   */
  public redact<T = unknown>(value: T, customSecrets?: string[]): T {
    if (value === null || value === undefined) {
      return value;
    }

    const secrets = [
      ...Array.from(this.knownSecrets),
      ...(customSecrets || []).filter((s) => typeof s === "string" && s.trim().length >= 3),
    ];

    if (secrets.length === 0) {
      return value;
    }

    // Sort secrets by descending length to prevent partial prefix replacement
    secrets.sort((a, b) => b.length - a.length);

    return this.deepRedact(value, secrets);
  }

  private deepRedact(val: any, secrets: string[]): any {
    if (typeof val === "string") {
      let result = val;
      for (const secret of secrets) {
        if (result.includes(secret)) {
          result = result.split(secret).join("[REDACTED_SECRET]");
        }
      }
      return result;
    }

    if (Array.isArray(val)) {
      return val.map((item) => this.deepRedact(item, secrets));
    }

    if (typeof val === "object" && val !== null) {
      const cloned: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        cloned[k] = this.deepRedact(v, secrets);
      }
      return cloned;
    }

    return val;
  }
}

export const secretRedactor = SecretRedactor.getInstance();
export const redactSecrets = <T = unknown>(val: T, secrets?: string[]): T =>
  secretRedactor.redact(val, secrets);
export const registerSecret = (secret: string): void => secretRedactor.register(secret);
