// Supabase Edge Function：AI 代理
// 部署：supabase functions deploy ai-proxy --no-verify-jwt
// 环境变量：supabase secrets set DEEPSEEK_API_KEY=sk-xxx
//
// 作用：把 DeepSeek 的 key 留在服务端，前端只调到这个函数。
// 请求：POST /functions/v1/ai-proxy  { messages: [...], tools?: [...], temperature?: number }
// 返回：{ message: { role, content, tool_calls? }, usage? }

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const MODEL = "deepseek-flash";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "只支持 POST" }, 405);

  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) return json({ error: "服务端没有配置 DEEPSEEK_API_KEY" }, 500);

  let payload: {
    messages?: unknown;
    tools?: unknown;
    temperature?: number;
    max_tokens?: number;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "请求体不是合法 JSON" }, 400);
  }

  if (!Array.isArray(payload.messages)) {
    return json({ error: "messages 必须是数组" }, 400);
  }

  const body: Record<string, unknown> = {
    model: MODEL,
    messages: payload.messages,
    temperature: typeof payload.temperature === "number" ? payload.temperature : 0.3,
  };
  if (Array.isArray(payload.tools) && payload.tools.length) {
    body.tools = payload.tools;
    body.tool_choice = "auto";
  }
  if (typeof payload.max_tokens === "number") body.max_tokens = payload.max_tokens;

  const upstream = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return json({ error: `上游 ${upstream.status}`, detail: text.slice(0, 400) }, 502);
  }

  const data = await upstream.json();
  const message = data?.choices?.[0]?.message ?? null;
  return json({ message, usage: data?.usage ?? null });
});
