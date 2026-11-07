/* 个人助理 — BaaS 客户端
 * 支持两家，按 config.js 的 BAAS_CONFIG.provider 切换：
 *   leancloud（国内，默认）
 *   supabase（海外备选）
 * 未配置时静默禁用，App 继续用本地存储
 */
window.CloudService = (function () {
  "use strict";

  var SESSION_KEY = "personal-assistant.session.v1";
  var session = readSession();
  var pushTimer = null;
  var refreshing = null;
  var listeners = [];

  /* ---------------- 配置 ---------------- */

  function cfg() {
    return window.BAAS_CONFIG || {};
  }

  function providerName() {
    var c = cfg();
    if (c.provider) return c.provider;
    return c.url ? "supabase" : "leancloud";
  }

  function enabled() {
    var c = cfg();
    if (!c.enabled) return false;
    if (providerName() === "leancloud") {
      var lc = c.leancloud || {};
      return !!(lc.appId && lc.appKey && lc.apiBase);
    }
    return !!(c.url && c.anonKey);
  }

  function currentSession() {
    if (!session) return null;
    if (session.provider && session.provider !== providerName()) return null;
    return session;
  }

  /* ---------------- 会话 ---------------- */

  function readSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeSession(data) {
    session = data;
    try {
      if (data) localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      else localStorage.removeItem(SESSION_KEY);
    } catch (err) {}
    emit();
  }

  function emit() {
    listeners.forEach(function (fn) {
      try {
        fn(status());
      } catch (err) {}
    });
  }

  function onChange(fn) {
    if (typeof fn === "function") listeners.push(fn);
  }

  function status() {
    var s = currentSession();
    return {
      enabled: enabled(),
      provider: providerName(),
      signedIn: !!(s && s.token),
      email: s ? s.email || "" : "",
      username: s ? s.username || "" : "",
      userId: s ? s.userId : null,
      account: s ? s.email || s.username || "" : "",
    };
  }

  /* ---------------- 通用请求 ---------------- */

  async function parseError(res) {
    var text = "";
    try {
      text = await res.text();
    } catch (err) {}
    var message = text;
    try {
      var data = JSON.parse(text);
      message = data.error || data.message || data.msg || data.error_description || text;
    } catch (err) {}
    return new Error(message || "请求失败（" + res.status + "）");
  }

  async function request(url, options) {
    var res = await fetch(url, options);
    if (!res.ok) throw await parseError(res);
    if (res.status === 204) return null;
    var text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /* =====================================================================
   * LeanCloud 适配器（国内）
   * ===================================================================== */

  var leancloud = {
    base: function () {
      return String(cfg().leancloud.apiBase || "").replace(/\/+$/, "");
    },

    headers: function (extra) {
      var lc = cfg().leancloud || {};
      var h = {
        "X-LC-Id": lc.appId,
        "X-LC-Key": lc.appKey,
        "Content-Type": "application/json",
      };
      var s = currentSession();
      if (s && s.token) h["X-LC-Session"] = s.token;
      return Object.assign(h, extra || {});
    },

    async signIn(account, password) {
      var body = { password: password };
      if (account.indexOf("@") > 0) body.email = account;
      else body.username = account;

      var data = await request(this.base() + "/login", {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });

      return {
        token: data.sessionToken,
        userId: data.objectId,
        email: data.email || (account.indexOf("@") > 0 ? account : ""),
        username: data.username || "",
        objectId: null,
      };
    },

    async signUp(account, password) {
      var body = { password: password };
      if (account.indexOf("@") > 0) {
        body.email = account;
        body.username = account.split("@")[0] + Math.random().toString(36).slice(2, 6);
      } else {
        body.username = account;
      }

      var data = await request(this.base() + "/users", {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });

      if (!data.sessionToken) {
        throw new Error("注册成功，请用刚才的账号登录");
      }

      return {
        token: data.sessionToken,
        userId: data.objectId,
        email: data.email || "",
        username: data.username || "",
        objectId: null,
      };
    },

    async signOut() {
      try {
        await request(this.base() + "/logout", { method: "POST", headers: this.headers() });
      } catch (err) {}
    },

    async pull() {
      var s = currentSession();
      if (!s) throw new Error("请先登录");
      var where = encodeURIComponent(JSON.stringify({ userId: s.userId }));
      var data = await request(
        this.base() + "/classes/AppState?where=" + where + "&limit=1",
        { method: "GET", headers: this.headers() }
      );
      if (!data || !data.results || !data.results.length) return null;

      var row = data.results[0];
      if (s.objectId !== row.objectId) {
        s.objectId = row.objectId;
        writeSession(s);
      }
      return { data: row.data, updated_at: row.updatedAt };
    },

    async push(payload) {
      var s = currentSession();
      if (!s) throw new Error("请先登录");

      var body = { userId: s.userId, data: payload };

      if (s.objectId) {
        await request(this.base() + "/classes/AppState/" + s.objectId, {
          method: "PUT",
          headers: this.headers(),
          body: JSON.stringify(body),
        });
        return true;
      }

      body.ACL = {};
      body.ACL[s.userId] = { read: true, write: true };

      var created = await request(this.base() + "/classes/AppState", {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      s.objectId = created.objectId;
      writeSession(s);
      return true;
    },
  };

  /* =====================================================================
   * Supabase 适配器（海外备选）
   * ===================================================================== */

  var supabase = {
    restUrl: function (path) {
      return String(cfg().url || "").replace(/\/+$/, "") + "/rest/v1" + path;
    },
    authUrl: function (path) {
      return String(cfg().url || "").replace(/\/+$/, "") + "/auth/v1" + path;
    },
    headers: function (extra) {
      var h = {
        apikey: cfg().anonKey,
        "Content-Type": "application/json",
      };
      var s = currentSession();
      h.Authorization = "Bearer " + ((s && s.token) || cfg().anonKey);
      return Object.assign(h, extra || {});
    },

    async signIn(email, password) {
      var data = await request(this.authUrl("/token?grant_type=password"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ email: email, password: password }),
      });
      if (!data || !data.access_token) throw new Error("登录失败，请检查邮箱和密码");
      return {
        token: data.access_token,
        userId: data.user.id,
        email: data.user.email || email,
        username: "",
        refreshToken: data.refresh_token,
      };
    },

    async signUp(email, password) {
      var data = await request(this.authUrl("/signup"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ email: email, password: password }),
      });
      if (data && data.access_token && data.user) {
        return {
          token: data.access_token,
          userId: data.user.id,
          email: data.user.email || email,
          username: "",
          refreshToken: data.refresh_token,
        };
      }
      throw new Error("注册成功，请先去邮箱点确认，再回来登录");
    },

    async signOut() {
      try {
        await request(this.authUrl("/logout"), { method: "POST", headers: this.headers() });
      } catch (err) {}
    },

    async pull() {
      var s = currentSession();
      if (!s) throw new Error("请先登录");
      var url =
        this.restUrl("/app_state") +
        "?select=data,updated_at&user_id=eq." +
        encodeURIComponent(s.userId) +
        "&limit=1";
      var rows = await request(url, { method: "GET", headers: this.headers() });
      if (!rows || !rows.length) return null;
      return rows[0];
    },

    async push(payload) {
      var s = currentSession();
      if (!s) throw new Error("请先登录");
      await request(this.restUrl("/app_state") + "?on_conflict=user_id", {
        method: "POST",
        headers: this.headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({
          user_id: s.userId,
          data: payload,
          updated_at: new Date().toISOString(),
        }),
      });
      return true;
    },
  };

  function adapter() {
    return providerName() === "leancloud" ? leancloud : supabase;
  }

  /* ---------------- 对外方法 ---------------- */

  async function signIn(account, password) {
    if (!enabled()) throw new Error("还没配置 BaaS，见 config.js 的 BAAS_CONFIG");
    var result = await adapter().signIn(account, password);
    writeSession(Object.assign({ provider: providerName() }, result));
    return result;
  }

  async function signUp(account, password) {
    if (!enabled()) throw new Error("还没配置 BaaS，见 config.js 的 BAAS_CONFIG");
    var result = await adapter().signUp(account, password);
    writeSession(Object.assign({ provider: providerName() }, result));
    return result;
  }

  async function signOut() {
    await adapter().signOut();
    writeSession(null);
  }

  async function pull() {
    if (!status().signedIn) throw new Error("请先登录");
    return adapter().pull();
  }

  async function push(data) {
    if (!status().signedIn) throw new Error("请先登录");
    return adapter().push(data);
  }

  async function uploadLocal() {
    var api = window.PersonalAssistant;
    if (!api || !api.exportData) throw new Error("数据接口未就绪");
    await push(api.exportData());
    return true;
  }

  async function downloadRemote() {
    var row = await pull();
    if (!row || !row.data) throw new Error("云端还没有数据");
    var api = window.PersonalAssistant;
    if (!api || !api.importData) throw new Error("数据接口未就绪");
    api.importData(row.data);
    return row;
  }

  function markDirty() {
    if (!status().signedIn) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      uploadLocal().catch(function (err) {
        console.warn("自动同步失败：", err);
      });
    }, 2500);
  }

  async function refresh() {
    if (providerName() !== "supabase") return true;
    var s = currentSession();
    if (!s || !s.refreshToken) return false;
    if (refreshing) return refreshing;

    refreshing = request(supabase.authUrl("/token?grant_type=refresh_token"), {
      method: "POST",
      headers: supabase.headers(),
      body: JSON.stringify({ refresh_token: s.refreshToken }),
    })
      .then(function (data) {
        writeSession(
          Object.assign({}, s, {
            token: data.access_token,
            refreshToken: data.refresh_token,
          })
        );
        return true;
      })
      .catch(function () {
        writeSession(null);
        return false;
      })
      .then(function (result) {
        refreshing = null;
        return result;
      });

    return refreshing;
  }

  return {
    enabled: enabled,
    provider: providerName,
    status: status,
    onChange: onChange,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    pull: pull,
    push: push,
    uploadLocal: uploadLocal,
    downloadRemote: downloadRemote,
    markDirty: markDirty,
    refresh: refresh,
  };
})();
