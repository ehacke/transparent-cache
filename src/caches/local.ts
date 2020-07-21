import LRU from 'lru-cache';
import { CacheConfigInterface, CacheInterface } from './cache';

/**
 * @class
 */
export class Local<T> implements CacheInterface<LRU<string, T>, T> {
  readonly config: CacheConfigInterface;

  readonly client: LRU<string, T>;

  /**
   * @param {CacheConfigInterface} config
   */
  constructor(config: CacheConfigInterface) {
    this.config = config;

    this.client = new LRU<string, T>({
      max: config.size,
      maxAge: config.ttlMs,
    });
  }

  /**
   * Get cache value
   *
   * @param {string} key
   * @returns {Promise<T | undefined>}
   */
  async get(key: string): Promise<T | undefined> {
    return this.client.get(key);
  }

  /**
   * Delete cache value
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key: string): Promise<void> {
    this.client.del(key);
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
    this.client.set(key, value, ttlMs);
  }
}
