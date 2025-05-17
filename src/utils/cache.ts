import NodeCache from 'node-cache';

export const cache = new NodeCache({
    stdTTL: 60 * 60, // 1 hour
    checkperiod: 120, // 2 minutes
    useClones: false,
});
