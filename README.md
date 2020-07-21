# transparent-cache
Simple transparent caching for Node. Wrap a function and then call it like normal.

## Install

This has a peer-dependency on [ioredis](https://github.com/luin/ioredis)

```bash
npm i -S transparent-cache ioredis
``` 

## Use

In the most basic case, you can just supply the redis config, and then wrap the function.

The `redisConfig` option is passed directly to `ioredis` and has the same properties as its [constructor](https://github.com/luin/ioredis/blob/master/API.md#new-redisport-host-options).

```javascript
import { TransparentCache } from 'transparent-cache';

const transparentCache = new TransparentCache({ redisConfig: { host: 'localhost', port: 6379 } });

function someSlowAndExpensiveFunction(someCoolArg) {
  // ... do things you want to cache
}

// By default, the wrapped version will cache results for 1 min locally and 5 minutes in Redis
const wrappedVersion = transparentCache.wrap(someSlowAndExpensiveFunction);

// No cache yet, call original function. Still slow.
let result = await wrappedVersion('foo');

// Immediately call again...

// Returns value from local cache for arg 'foo'
result = await wrappedVersion('foo'); 

// .... waiting two minutes ....

// Nothing in the local cache, so it goes to Redis
result = await wrappedVersion('foo');

// ... waiting 10 minutes ...

// Nothing in local or Redis, so it calls the original function
result = await wrappedVersion('foo');

// Clear caches locally and remotely for 'foo'
// NOTE: This doesn't clear local caches on other nodes
await wrappedVersion.delete('foo');

// Hits original again because caches were cleared
result = await wrappedVersion('foo');
```

