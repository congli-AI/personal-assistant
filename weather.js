/* 个人助理 — 天气预报（Open-Meteo，免费、无需 key）
 * 依赖 config.js 里的 window.WEATHER_CONFIG
 * 对外：WeatherService.load() / getDay(key) / getPlace() / getToday() / onChange(fn)
 */
window.WeatherService = (function () {
  "use strict";

  var API = "https://api.open-meteo.com/v1/forecast";
  var CACHE_KEY = "personal-assistant.weather.v1";

  var state = {
    status: "idle", // idle | loading | ok | error | off
    place: "",
    precise: false,
    days: {}, // 'YYYY-MM-DD' -> { code, max, min, pop }
    updatedAt: 0,
    error: "",
  };

  var listeners = [];
  var loading = null;
  var lastLoc = null;

  function cfg() {
    return window.WEATHER_CONFIG || {};
  }

  function onChange(fn) {
    if (typeof fn === "function") listeners.push(fn);
  }

  function emit() {
    listeners.forEach(function (fn) {
      try {
        fn(state);
      } catch (err) {
        console.warn("天气回调出错：", err);
      }
    });
  }

  /* ---------------- 工具 ---------------- */

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function keyOf(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function round(n) {
    return typeof n === "number" && isFinite(n) ? Math.round(n) : null;
  }

  /* ---------------- 缓存 ---------------- */

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.days || !data.updatedAt) return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  function writeCache(snapshot) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    } catch (err) {
      console.warn("天气缓存写入失败：", err);
    }
  }

  function cacheFresh(data) {
    var minutes = cfg().cacheMinutes || 30;
    return data && Date.now() - data.updatedAt < minutes * 60 * 1000;
  }

  /* ---------------- 定位 ---------------- */

  function locate() {
    var fallbackCfg = cfg().fallback || {};
    var fallback = {
      name: fallbackCfg.name || "北京",
      latitude: typeof fallbackCfg.latitude === "number" ? fallbackCfg.latitude : 39.9042,
      longitude: typeof fallbackCfg.longitude === "number" ? fallbackCfg.longitude : 116.4074,
      precise: false,
    };

    if (!cfg().useGeolocation || !navigator.geolocation) {
      return Promise.resolve(fallback);
    }

    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) {
          settled = true;
          resolve(fallback);
        }
      }, 8000);

      function done(value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }

      try {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            done({
              name: "当前位置",
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              precise: true,
            });
          },
          function () {
            done(fallback);
          },
          { enableHighAccuracy: false, timeout: 7000, maximumAge: 10 * 60 * 1000 }
        );
      } catch (err) {
        done(fallback);
      }
    });
  }

  /* ---------------- 天气文案 ---------------- */

  function describe(code) {
    if (code === 0) return "晴";
    if (code === 1 || code === 2) return "多云";
    if (code === 3) return "阴";
    if (code === 45 || code === 48) return "雾";
    if (code >= 51 && code <= 57) return "毛毛雨";
    if (code >= 61 && code <= 65) return "雨";
    if (code === 66 || code === 67) return "冻雨";
    if (code >= 71 && code <= 77) return "雪";
    if (code >= 80 && code <= 82) return "阵雨";
    if (code >= 85 && code <= 86) return "阵雪";
    if (code >= 95) return "雷雨";
    return "未知";
  }

  function isWet(code) {
    return (
      (code >= 51 && code <= 67) ||
      (code >= 71 && code <= 77) ||
      (code >= 80 && code <= 86) ||
      (code >= 95 && code <= 99)
    );
  }

  /**
   * 某一天的完整信息 + 提醒文案
   * @param {string} dateKey 'YYYY-MM-DD'
   */
  function getDay(dateKey) {
    var day = state.days[dateKey];
    if (!day) return null;

    var rainPop = typeof cfg().rainProbability === "number" ? cfg().rainProbability : 50;
    var hotTemp = typeof cfg().hotTemp === "number" ? cfg().hotTemp : 30;
    var coldTemp = typeof cfg().coldTemp === "number" ? cfg().coldTemp : 10;

    var code = day.code;
    var snow = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
    var wet = isWet(code) || (typeof day.pop === "number" && day.pop >= rainPop);
    var max = round(day.max);
    var min = round(day.min);
    var hot = typeof max === "number" && max >= hotTemp;
    var cold = typeof max === "number" && max <= coldTemp;

    var advice = [];
    if (wet) advice.push("记得带伞");
    if (snow || cold) advice.push("记得加衣");
    if (hot) advice.push("注意避暑，涂好防晒霜");

    var parts = [describe(day.code)];
    if (max !== null && min !== null) parts.push(min + "°~" + max + "°");
    if (typeof day.pop === "number" && day.pop >= 20) parts.push("降水 " + Math.round(day.pop) + "%");

    return {
      text: parts.join(" "),
      short: describe(code),
      max: max,
      min: min,
      pop: day.pop,
      rainy: wet,
      hot: hot,
      snow: snow,
      cold: cold,
      advice: advice.join("，"),
    };
  }

  function getPlace() {
    return state.place;
  }

  function getToday() {
    return getDay(keyOf(new Date()));
  }

  function getState() {
    return state;
  }

  /* ---------------- 请求 ---------------- */

  function fetchForecast(loc) {
    var url =
      API +
      "?latitude=" + loc.latitude +
      "&longitude=" + loc.longitude +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=auto&forecast_days=7";

    return fetch(url, { signal: AbortSignal.timeout(12000) })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var daily = data && data.daily;
        if (!daily || !daily.time) throw new Error("天气数据格式异常");

        var days = {};
        daily.time.forEach(function (dateKey, i) {
          days[dateKey] = {
            code: daily.weather_code[i],
            max: daily.temperature_2m_max[i],
            min: daily.temperature_2m_min[i],
            pop:
              daily.precipitation_probability_max && daily.precipitation_probability_max[i] !== null
                ? daily.precipitation_probability_max[i]
                : null,
          };
        });

        state.status = "ok";
        state.place = loc.name;
        state.precise = !!loc.precise;
        state.days = days;
        state.updatedAt = Date.now();
        state.error = "";

        writeCache({
          place: state.place,
          precise: state.precise,
          days: state.days,
          updatedAt: state.updatedAt,
        });
        lastLoc = loc;
        emit();
        return state;
      });
  }

  function load(force) {
    if (!cfg().enabled) {
      state.status = "off";
      emit();
      return Promise.resolve(state);
    }
    if (loading) return loading;

    var cached = readCache();
    if (!force && cached && cacheFresh(cached)) {
      state.status = "ok";
      state.place = cached.place;
      state.precise = !!cached.precise;
      state.days = cached.days;
      state.updatedAt = cached.updatedAt;
      emit();
      return Promise.resolve(state);
    }

    state.status = "loading";
    emit();

    loading = locate()
      .then(function (loc) {
        return fetchForecast(loc);
      })
      .catch(function (err) {
        console.warn("天气获取失败：", err);
        // 请求失败时退回旧缓存，至少别让列表空着
        if (cached && cached.days) {
          state.status = "ok";
          state.place = cached.place;
          state.precise = !!cached.precise;
          state.days = cached.days;
          state.updatedAt = cached.updatedAt;
        } else {
          state.status = "error";
          state.error = String(err && err.message ? err.message : err);
        }
        emit();
        return state;
      })
      .then(function (result) {
        loading = null;
        return result;
      });

    return loading;
  }

  return {
    load: load,
    getDay: getDay,
    getToday: getToday,
    getPlace: getPlace,
    getState: getState,
    onChange: onChange,
    keyOf: keyOf,
  };
})();
