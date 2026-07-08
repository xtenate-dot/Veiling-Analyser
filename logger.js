/**
 * logger.js
 * Centrale logger. Houdt de laatste N regels vast in het geheugen (handig bij
 * bugrapportages) en schrijft door naar de console met een consistent prefix.
 */
(function (App) {
  'use strict';

  var MAX_HISTORY = 100;
  var history = [];

  function push(level, args) {
    var entry = { level: level, time: new Date().toISOString(), message: Array.prototype.slice.call(args).map(String).join(' ') };
    history.push(entry);
    if (history.length > MAX_HISTORY) history.shift();
  }

  function info() { push('info', arguments); console.log.apply(console, ['[HNVI]'].concat(Array.prototype.slice.call(arguments))); }
  function warn() { push('warn', arguments); console.warn.apply(console, ['[HNVI]'].concat(Array.prototype.slice.call(arguments))); }
  function error() { push('error', arguments); console.error.apply(console, ['[HNVI]'].concat(Array.prototype.slice.call(arguments))); }

  function getHistory() { return history.slice(); }

  App.logger = { info: info, warn: warn, error: error, getHistory: getHistory };
})(window.App = window.App || {});
