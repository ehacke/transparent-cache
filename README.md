# transparent-cache

![npm](https://img.shields.io/npm/v/@ehacke/transparent-cache)
![CircleCI](https://img.shields.io/circleci/build/github/ehacke/transparent-cache)
![GitHub](https://img.shields.io/github/license/ehacke/transparent-cache)
![Codecov](https://img.shields.io/codecov/c/gh/ehacke/transparent-cache)

Simple transparent caching for Node. Wrap a function and then call it like normal.

## Features

- The cache is periodically updated in the background without blocking the primary call. So it's always fast.
- Just wrap any function and it becomes cached
- Includes both local LRU cache and Redis

## Install

This has a peer-dependency on [ioredis](https://github.com/luin/ioredis)

```bash
npm i -S transparent-cache ioredis
``` 

## Use

In the most basic case, you can just supply the redis config, and then wrap the function.

As you call the function, the result will 

The `redisConfig` option is passed directly to `ioredis` and has the same properties as its [constructor](https://github.com/luin/ioredis/blob/master/API.md#new-redisport-host-options).

```javascript
import { TransparentCache } from 'transparent-cache';

const transparentCache = new TransparentCache({ redisConfig: { host: 'localhost', port: 6379 } });

function someSlowAndExpensiveFunction(someCoolArg) {
  // ... do things you want to cache
}

// By default, the wrapped version will cache results for 30 sec locally and 10 minutes in Redis
const wrappedVersion = transparentCache.wrap(someSlowAndExpensiveFunction);

// No cache yet, call original function. Still slow.
let result = await wrappedVersion('foo');

// Immediately call again...

// Returns value from local cache for arg 'foo'
result = await wrappedVersion('foo'); 

// .... waiting two minutes ....

// Nothing in the local cache, so it goes to Redis
result = await wrappedVersion('foo');

// ... waiting 15 minutes ...

// Nothing in local or Redis, so it calls the original function
result = await wrappedVersion('foo');

// Clear caches locally and remotely for 'foo'
// NOTE: This doesn't clear local caches on other nodes
await wrappedVersion.delete('foo');

// Hits original again because caches were cleared
result = await wrappedVersion('foo');
```

## API

### Constructor

During construction, the default values for each `wrap` call are set.

The local and remote properties are used as the default for each `wrap` call, but can be overridden.

```typescript
interface ConstructorInterface {
  redis?: Redis;                // Instead of providing the config below, you can provide a constructed IORedis instance
  redisConfig?: RedisOptions;   // Same as: https://github.com/luin/ioredis/blob/master/API.md#new-redisport-host-options
                                // Defaults to: { keyPrefix: 'trans-cache-', enableOfflineQueue: false }
                                //    This namespaces the keys, and ensures the redis calls fail fast if disconnected
  local?: {
    size?: number;              // Defaults to 1000
    ttlMs?: number;             // Defaults to 30 seconds
  };
  remote?: {
    size?: number;              // Defaults to 10000
    ttlMs?: number;             // Defaults to 10 minutes
    commandTimeoutMs?: number;  // Redis command timeout. Defaults to 50 ms
  };
}
```

### Wrap

```typescript
import { TransparentCache } from 'transparent-cache';

const transparentCache = new TransparentCache({ redisConfig: { host: 'localhost', port: 6379 } });

transparentCache.wrap<TypeOfReturn>(
  functionToWrap,                 // Any function. Promises are awaited
  overrideConfig: {               // Defaults to constructor values 
    local?: {
      size?: number;              // Defaults to 1000
      ttlMs?: number;             // Defaults to 30 seconds
    };
    remote?: {
      size?: number;              // Defaults to 10000
      ttlMs?: number;             // Defaults to 10 minutes
      commandTimeoutMs?: number;  // Redis command timeout. Defaults to 50 ms
    };
    waitForRefresh?: boolean;     // Normally cache refreshes are done in the background. This forces them to block.
  }, 
  functionId,                     // Used as part of the cache key, defaults to the function name if present
  that,                           // Reference to 'this' for the wrapped function, used with .apply()
)
```

The wrapped version of the function also exposes a `.delete()` property that can be called to wipe the cache for a specific set of args.

```typescript
// Clear caches locally and remotely for 'foo'
// NOTE: This doesn't clear local caches on other nodes
await wrappedVersion.delete('foo');
```

