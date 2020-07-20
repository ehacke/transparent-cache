import Bluebird from 'bluebird';
import { Redis } from 'ioredis';
import { CacheInterface } from './cache';
import Logger from '../logger';

const log = Logger('remote');

const DEFAULT_COMMAND_TIMEOUT_MS = 50;

interface ConfigInterface<T> {
  size: number;
  ttlMs: number;
  commandTimeoutMs?: number;
  toJson?: (input: T) => Promise<Record<string, any>> | Record<string, any>;
  fromJson?: (input: Record<string, any>) => Promise<T> | T;
}

interface InternalConfigInterface<T> extends Omit<ConfigInterface<T>, 'commandTimeoutMs' | 'toJson' | 'fromJson'> {
  commandTimeoutMs: number;
  toJson: (input: T) => Promise<Record<string, any>> | Record<string, any>;
  fromJson: (input: Record<string, any>) => Promise<T> | T;
}

/**
 * @class
 */
export class Remote<T> implements CacheInterface<Redis, T> {
  private readonly config: InternalConfigInterface<T>;

  readonly client: Redis;

  private async failSafe(action: () => Promise<any>): Promise<string | null> {
    try {
      return Bluebird.try(() => action())
        .timeout(this.config.commandTimeoutMs)
        .catch((error) => log(`Error during remote '${action}'. Error: ${error}`));
    } catch {
      return Promise.resolve(null);
    }
  }

  constructor(config: ConfigInterface<T>, client: Redis) {
    this.config = {
      commandTimeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      toJson: (input) => input,
      fromJson: (input) => input as any,
      ...config,
    };
    this.client = client;
  }

  async delete(key: string): Promise<void> {
    await this.failSafe(() => this.client.del(key));
  }

  async get(key: string): Promise<T | null> {
    const result = await this.failSafe(() => this.client.get(key));

    if (!result) return null;

    return this.config.fromJson(JSON.parse(result)?.value);
  }

  async setpx(key: string, value: T, ttlMs = this.config.ttlMs): Promise<void> {
    await this.failSafe(() => this.client.set(key, JSON.stringify({ value: this.config.toJson(value) }), 'PX', ttlMs));
  }
}
