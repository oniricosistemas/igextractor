'use strict';

let _debug = false;

const setDebug = (v) => { _debug = !!v; };
const isDebug  = ()  => _debug;
const dbg      = (...args) => { if (_debug) console.log('[DEBUG]', ...args); };

module.exports = { setDebug, isDebug, dbg };
