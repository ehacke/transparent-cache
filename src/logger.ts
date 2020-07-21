import debug from 'debug';

import pjson from '../package.json';

/**
 * Get logger
 *
 * @param {string} prefix
 * @returns {debug}
 */
const getLogger = (prefix: string): debug => debug(`${pjson.name}:${prefix}`);

export default getLogger;
