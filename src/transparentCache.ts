import Bluebird from 'bluebird';
import IORedis, { Redis, RedisOptions } from 'ioredis';
import { v4 as uuid } from 'uuid';
import stringify from 'fast-json-stable-stringify';
import { CacheInterface } from './caches/cache';

import Logger from './logger';
import { Remote } from './caches/remote';
import { Local } from './caches/local';

const log = Logger('transparentCache');

export interface ConfigInterface {
  redis?: Redis;
  redisConfig?: RedisOptions;
  local?: {
    size?: number;
    ttlMs?: number;
  };
  remote?: {
    size?: number;
    ttlMs?: number;
    commandTimeoutMs?: number;
  };
}

const CONSTANTS = {
  DEFAULTS: {
    REDIS: {
      dropBufferSupport: true,
      enableOfflineQueue: false,
      keyPrefix: 'trans-cache-',
    },
    LOCAL: {
      size: 1000,
      ttlMs: 1000 * 60,
    },
    REMOTE: {
      size: 10000,
      ttlMs: 1000 * 60 * 5,
      commandTimeoutMs: 50,
    },
  },
};

interface InternalConfigInterface {
  local: {
    size: number;
    ttlMs: number;
  };
  remote: {
    size: number;
    ttlMs: number;
    commandTimeoutMs: number;
  };
}

export class TransparentCache {
  private readonly config: InternalConfigInterface;

  readonly redisClient: Redis;

  constructor(config: ConfigInterface) {
    if (!config.redisConfig && !config.redis) {
      throw new Error('Must provide ioredis instance or ioredis config');
    }

    this.redisClient = config.redis || new IORedis({ ...CONSTANTS.DEFAULTS.REDIS, ...config.redisConfig });

    this.config = {
      local: {
        ...CONSTANTS.DEFAULTS.LOCAL,
        ...config?.local,
      },
      remote: {
        ...CONSTANTS.DEFAULTS.REMOTE,
        ...config?.remote,
      },
    };
  }

  async wrap<T>(functionToWrap, ttlMs?: number, that = null, functionId = null): Promise<T | null> {
    functionId = (typeof functionId === 'string' && functionId) || functionToWrap.name || uuid();

    const remoteCache = new Remote<T>(this.config.remote, this.redisClient);
    const localCache = new Local<T>(this.config.local);

    const localTtlMs = ttlMs ? ttlMs / 2 : undefined;

    const cacheFunction = async (...args) => {
      const key = functionId + (args && stringify(args));

      log.debug(`get value for key ${key}`);

      const localValue = await localCache.get(key);

      if (typeof localValue !== 'undefined') {
        log.debug('Found value in local cache');
        return localValue;
      }

      const remoteValue = await remoteCache.get(key);

      if (remoteValue !== null && typeof remoteValue !== 'undefined') {
        log.debug('Found value in remote cache');
        return localCache.setpx(key, remoteValue, localTtlMs);
      }

      const serviceValue = await Bluebird.try(() => functionToWrap.apply(that, args));

      await this.updateCaches<T>(remoteCache, localCache)(key, serviceValue);
      await this.refreshBuffer(remoteCache, localCache)(key, functionToWrap, that, args);

      return serviceValue;
    };
  }

  updateCaches<T>(remoteCache: Remote<T>, localCache: Local<T>): (key: string, value: T) => Promise<void> {
    return async (key: string, value: T): Promise<void> => {
      await localCache.setpx(key, value);
      await remoteCache.setpx(key, value);
    };
  }

  refreshBuffer<T>(remoteCache: Remote<T>, localCache: Local<T>): (key: string, action, that, args) => Promise<void> {
    return async (key: string, action, that, args) => {
      log.debug(`checkBuffer ${key}`);

      return remoteCache.pttl(key).then((ttl) => {
        const minTimeRemaining = this.config.remote.ttlMs - this.config.local.ttlMs;

        log.debug(`TTL: ${ttl} BufferTTL: ${remoteCacheSpec.bufferTtl} Min Time Remaining: ${minTimeRemaining}`);

        if (!ttl || ttl < minTimeRemaining) {
          log.debug('TTL requires cache refresh.');
          return self.obtainRefreshLock(key).then((locked) => {
            if (locked) {
              return Promise.resolve(action.apply(that, args))
                .then((response) =>
                  self.remoteCache.setpx(key, wrapForRedis(response)).then(() => self.localCache.setpx(key, response, localCacheSpec.ttl))
                )
                .finally(() => self.releaseRefreshLock(key));
            }
            log.debug('Could not lock for refresh');
          });
        }
        log.debug('No cache refresh required');
      });
    };
  }
}
