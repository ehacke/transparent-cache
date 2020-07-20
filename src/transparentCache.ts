import Bluebird from 'bluebird';
import IORedis, { Redis, RedisOptions } from 'ioredis';
import stringify from 'fast-json-stable-stringify';
import { CacheConfigInterface } from './caches/cache';

import Logger from './logger';
import { Remote, RemoteConfigInterface as RemoteCacheConfigInterface } from './caches/remote';
import { Local } from './caches/local';

const log = Logger('transparentCache');

export interface ConfigInterface {
  redis?: Redis;
  redisConfig?: RedisOptions;
  local?: Partial<CacheConfigInterface>;
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
      // eslint-disable-next-line no-magic-numbers
      ttlMs: 1000 * 60,
    },
    REMOTE: {
      size: 10000,
      // eslint-disable-next-line no-magic-numbers
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

const validateConfig = (config: InternalConfigInterface) => {
  if (typeof config !== 'object') {
    throw new TypeError('config must be an object');
  }

  if (config?.remote?.ttlMs <= 0) {
    throw new Error('remote.ttlMs must be gt 0');
  }

  if (config?.local?.ttlMs <= 0) {
    throw new Error('local.ttlMs must be gt 0');
  }

  if (config?.remote?.ttlMs < config?.local?.ttlMs) {
    throw new Error('remote.ttlMs must be gte local.ttlMs');
  }

  if (config?.remote?.commandTimeoutMs <= 0) {
    throw new Error('remote.commandTimeoutMs must be gt 0');
  }
};

const handleServiceError = (functionId) => (error) => {
  console.error(`Error while calling wrapped function: ${functionId}`);
  console.error(`Error: ${error.stack}`);
  return undefined;
};

interface WrappableFunction<T> {
  (...args): Promise<T> | T;
}

interface CachedFunctionInterface<T> {
  (...args): Promise<T | undefined>;
  delete(...args): Promise<void>;
}

interface OverrideConfigInterface<T> {
  local?: Partial<CacheConfigInterface>;
  remote?: Partial<RemoteCacheConfigInterface<T>>;
  waitForRefresh?: boolean;
}

/**
 * @class
 */
export class TransparentCache {
  private readonly config: InternalConfigInterface;

  readonly redisClient: Redis;

  /**
   * @param {ConfigInterface} config
   */
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

    validateConfig(this.config);
  }

  /**
   * Apply override to config
   *
   * @param {OverrideConfigInterface<T>} overrideConfig
   * @returns {{ local: CacheConfigInterface, remote: RemoteCacheConfigInterface<T> }}
   */
  applyConfigOverrides<T>(overrideConfig: OverrideConfigInterface<T>): { local: CacheConfigInterface; remote: RemoteCacheConfigInterface<T> } {
    const config: { local: CacheConfigInterface; remote: RemoteCacheConfigInterface<T> } = {
      local: { ...this.config.local, ...overrideConfig.local },
      remote: { ...this.config.remote, ...overrideConfig.remote },
    };
    config.local.ttlMs = config.remote.ttlMs < config.local.ttlMs ? config.remote.ttlMs : config.local.ttlMs;
    validateConfig(config);

    return config;
  }

  /**
   * Wrap function with caching
   *
   * @param {WrappableFunction<T>} functionToWrap
   * @param {OverrideConfigInterface<T>} overrideConfig
   * @param {string | null} functionId
   * @param {any} that
   * @returns {Promise<CachedFunctionInterface<T>>}
   */
  async wrap<T>(
    functionToWrap: WrappableFunction<T>,
    overrideConfig: OverrideConfigInterface<T>,
    functionId = null,
    that = null
  ): Promise<CachedFunctionInterface<T>> {
    const internalFunctionId: string = (typeof functionId === 'string' && functionId) || functionToWrap.name;

    if (!internalFunctionId) {
      throw new Error('functionId required for unnamed functions');
    }

    const config = this.applyConfigOverrides<T>(overrideConfig);

    const remoteCache = new Remote<T>(config.remote, this.redisClient);
    const localCache = new Local<T>(config.local);

    const cacheFunction = async (...args): Promise<T | undefined> => {
      const key = internalFunctionId + (args && stringify(args));

      log.debug(`get value for key ${key}`);

      let value = await localCache.get(key);

      if (typeof value === 'undefined') {
        value = await remoteCache.get(key);
      } else {
        log('Found value in local cache');
      }

      if (typeof value === 'undefined') {
        value = await Bluebird.try(() => functionToWrap.apply(that, args)).catch(handleServiceError(functionId));
        if (typeof value !== 'undefined') {
          await TransparentCache.updateCaches<T>(remoteCache, localCache)(key, value);
        }
      } else {
        log('Found value in remote cache');
        await localCache.setpx(key, value);
      }

      if (typeof value !== 'undefined') {
        if (overrideConfig.waitForRefresh) {
          await TransparentCache.checkAndRefreshCaches(remoteCache, localCache)(key, functionToWrap, internalFunctionId, that, args);
        } else {
          TransparentCache.checkAndRefreshCaches(remoteCache, localCache)(key, functionToWrap, internalFunctionId, that, args);
        }
      }

      return value;
    };

    cacheFunction.delete = async (...args): Promise<void> => {
      const deleteKey = internalFunctionId + (args && stringify(args));
      await TransparentCache.deleteCaches<T>(remoteCache, localCache)(deleteKey);
    };

    return cacheFunction;
  }

  /**
   * Delete cached values
   *
   * @param {Remote<T>} remoteCache
   * @param {Local<T>} localCache
   * @returns {Promise<void>}
   */
  static deleteCaches<T>(remoteCache: Remote<T>, localCache: Local<T>): (key: string) => Promise<void> {
    return async (key: string): Promise<void> => {
      await localCache.delete(key);
      await remoteCache.delete(key);
    };
  }

  /**
   * Update cached values
   *
   * @param {Remote<T>} remoteCache
   * @param {Local<T>} localCache
   * @returns {Promise<void>}
   */
  static updateCaches<T>(remoteCache: Remote<T>, localCache: Local<T>): (key: string, value: T) => Promise<void> {
    return async (key: string, value: T): Promise<void> => {
      await localCache.setpx(key, value);
      await remoteCache.setpx(key, value);
    };
  }

  /**
   * Check and refresh caches
   *
   * @param {Remote<T>} remoteCache
   * @param {Local<T>} localCache
   * @returns {(key: string, functionToWrap, functionId: string, that, args) => Promise<void>}
   */
  static checkAndRefreshCaches<T>(
    remoteCache: Remote<T>,
    localCache: Local<T>
  ): (key: string, functionToWrap, functionId: string, that, args) => Promise<void> {
    return async (key: string, functionToWrap: WrappableFunction<T>, functionId: string, that, args) => {
      log.debug(`checkBuffer ${key}`);

      const pttlMs = await remoteCache.pttl(key);
      const minTimeRemainingMs = remoteCache.config.ttlMs - localCache.config.ttlMs;

      log(`TTL: ${pttlMs} Remote TTL: ${remoteCache.config.ttlMs} Local TTL: ${localCache.config.ttlMs} Min Time Remaining: ${minTimeRemainingMs}`);

      if (!pttlMs || pttlMs < minTimeRemainingMs) {
        log.debug('TTL requires cache refresh.');

        const value = await Bluebird.try(() => functionToWrap.apply(that, args)).catch(handleServiceError(functionId));

        if (typeof value !== 'undefined') {
          await TransparentCache.updateCaches<T>(remoteCache, localCache)(key, value);
        }
      }
      log.debug('No cache refresh required');
    };
  }
}
