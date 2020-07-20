import LRU from 'lru-cache';
import { CacheInterface } from './cache';

interface ConfigInterface {
  size: number;
  ttlMs: number;
}

/**
 * @class
 */
export class Local<T> implements CacheInterface<LRU<string, T>, T> {
  private readonly config: ConfigInterface;

  readonly client: LRU<string, T>;

  constructor(config: ConfigInterface) {
    this.config = config;

    this.client = new LRU<string, T>({
      max: config.size,
      maxAge: config.ttlMs,
    });
  }

  async get(key: string): Promise<T | null> {
    return this.client.get(key) || null;
  }

  async delete(key: string): Promise<void> {
    this.client.del(key);
  }

  async setpx(key: string, value: T, ttlMs = this.config.ttlMs): Promise<void> {
    this.client.set(key, value, ttlMs);
  }
}
