/* 个人助理 — 用户设置
 * 覆盖 config.js 里的默认值，存 localStorage
 */
window.SettingsService = (function () {
  "use strict";

  var KEY = "personal-assistant.settings.v1";

  var DEFAULTS = {
    leadMinutes: 30,
    hotTemp: 30,
    coldTemp: 10,
    useGeolocation: true,
    notify: true,
  };

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      var parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULTS, parsed || {});
    } catch (err) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("保存设置失败：", err);
    }
  }

  /** 把设置写回各模块的运行时配置 */
  function apply() {
    if (window.SCHEDULE_CONFIG) {
      window.SCHEDULE_CONFIG.leadMinutes = state.leadMinutes;
    }
    if (window.WEATHER_CONFIG) {
      window.WEATHER_CONFIG.hotTemp = state.hotTemp;
      window.WEATHER_CONFIG.coldTemp = state.coldTemp;
      window.WEATHER_CONFIG.useGeolocation = state.useGeolocation;
    }
  }

  function get(key) {
    return key ? state[key] : Object.assign({}, state);
  }

  function set(key, value) {
    if (!(key in DEFAULTS)) return state;
    state[key] = value;
    save();
    apply();
    return Object.assign({}, state);
  }

  function resetAll() {
    state = Object.assign({}, DEFAULTS);
    save();
    apply();
    return Object.assign({}, state);
  }

  apply();

  return {
    defaults: Object.assign({}, DEFAULTS),
    get: get,
    set: set,
    resetAll: resetAll,
    apply: apply,
  };
})();
