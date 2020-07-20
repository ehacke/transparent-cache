import Bluebird from 'bluebird';
import { Redis } from 'ioredis';
import { CacheConfigInterface, CacheInterface } from './cache';
import Logger from '../logger';

const log = Logger('remote');

export interface RemoteConfigInterface<T> extends CacheConfigInterface {
  commandTimeoutMs: number;
  toJson?: (input: T) => Promise<Record<string, any>> | Record<string, any>;
  fromJson?: (input: Record<string, any>) => Promise<T> | T;
}

interface InternalConfigInterface<T> extends Omit<RemoteConfigInterface<T>, 'toJson' | 'fromJson'> {
  toJson: (input: T) => Promise<Record<string, any>> | Record<string, any>;
  fromJson: (input: Record<string, any>) => Promise<T> | T;
}

/**
 * @class
 */
export class Remote<T> implements CacheInterface<Redis, T> {
  readonly config: InternalConfigInterface<T>;

  readonly client: Redis;

  /**
   * Fail safe call to Redis
   *
   * @param {Function} action
   * @returns {Promise<T | null>}
   */
  private async failSafe<T>(action: () => Promise<any>): Promise<T | null> {
    try {
      return Bluebird.try(() => action())
        .timeout(this.config.commandTimeoutMs)
        .catch((error) => {
          log(`Error during remote '${action}'. Error: ${error}`);
        });
    } catch {
      return Promise.resolve(null);
    }
  }

  /**
   * @param {RemoteConfigInterface<T>} config
   * @param {Redis} client
   */
  constructor(config: RemoteConfigInterface<T>, client: Redis) {
    this.config = {
      toJson: (input) => input,
      fromJson: (input) => input as any,
      ...config,
    };
    this.client = client;
  }

  /**
   * Delete cache value
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key: string): Promise<void> {
    await this.failSafe<void>(() => this.client.del(key));
  }

  /**
   * Get cache value
   *
   * @param {string} key
   * @returns {Promise<T | undefined>}
   */
  async get(key: string): Promise<T | undefined> {
    const result = await this.failSafe<string>(() => this.client.get(key));
    if (!result) return undefined;
    return this.config.fromJson(JSON.parse(result)?.value);
  }

  /**
   * Set value with expiry
   *
   * @param {string} key
   * @param {T} value
   * @param {number} [ttlMs]
   * @returns {Promise<void>}
   */
  async setpx(key: string, value: T, ttlMs = this.config.ttlMs): Promise<void> {
    await this.failSafe<void>(() => this.client.set(key, JSON.stringify({ value: this.config.toJson(value) }), 'PX', ttlMs));
  }

  /**
   * Get ttl
   *
   * @param {string} key
   * @returns {Promise<number | null>}
   */
  async pttl(key: string): Promise<number | null> {
    return this.failSafe<number>(() => this.client.pttl(key));
  }
}
