/**
 * state.js — Lightweight global state + event emitter
 */

const State = (() => {
  let _state = {
    projects: [],
    sessions: [],
    historySessions: [],
    activeSessionId: null,
    activePanel: 'welcome',
  };

  const _listeners = {};

  function get() { return _state; }

  function set(patch) {
    _state = { ..._state, ...patch };
  }

  function on(event, fn) {
    (_listeners[event] = _listeners[event] || []).push(fn);
  }

  function off(event, fn) {
    if (_listeners[event]) {
      _listeners[event] = _listeners[event].filter(f => f !== fn);
    }
  }

  function emit(event, data) {
    (_listeners[event] || []).forEach(fn => fn(data));
  }

  return { get, set, on, off, emit };
})();
