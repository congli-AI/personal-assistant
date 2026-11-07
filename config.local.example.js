/* =====================================================================
 * 个人助理 — 本地私密配置【示例】
 * ---------------------------------------------------------------------
 * 这个文件可以放心提交到仓库（里面没有真实密钥）。
 *
 * 用法：
 *   1. 复制一份，命名为 config.local.js
 *      Windows 资源管理器里直接复制粘贴再改名即可
 *   2. 把下面的 apiKey 换成你自己的
 *   3. 刷新页面就能用
 *
 * config.local.js 已写进 .gitignore，不会被提交，也不会出现在公开仓库。
 *
 * 只填你想覆盖的项，没填的沿用 config.js 里的默认值。
 * ===================================================================== */
window.PA_LOCAL = {
  // DeepSeek 密钥，https://platform.deepseek.com/api_keys 申请
  apiKey: "sk-在这里填你自己的密钥",

  // ↓ 下面都是可选项，一般不用动

  // 换服务商时才需要（默认 https://api.deepseek.com/v1）
  // baseUrl: "https://api.deepseek.com/v1",
  // model: "deepseek-chat",

  // 想用第三方语音转写时再填（默认用浏览器自带识别）
  // transcription: {
  //   enabled: true,
  //   baseUrl: "https://api.siliconflow.cn/v1",
  //   apiKey: "sk-...",
  //   model: "FunAudioLLM/SenseVoiceSmall",
  // },

  // 想接 LeanCloud 云同步时再填（默认纯本地）
  // leancloud: {
  //   appId: "",
  //   appKey: "",
  //   apiBase: "https://xxxxxxxx.api.lncldapi.com/1.1",
  // },
};
