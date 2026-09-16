// 이수역 남측 횡단보도(itstId 23251) 실시간 신호 프록시 — Cloudflare Worker
//
// 역할: T-Data API 키를 숨기고, CORS를 붙이고, 업스트림을 짧게 캐시하고,
//       장애 시에도 마지막 값 + stale 플래그로 200을 반환한다.
//
// 배포 절차는 README.md 참고. 이 파일에는 키를 절대 넣지 말 것.
//   wrangler secret put TDATA_API_KEY   ← 여기서 키를 등록
//   wrangler deploy

const UPSTREAM =
  "https://t-data.seoul.go.kr/apig/apiman-gateway/tapi/v2xSignalPhaseTimingFusionCurrentInfo/1.0";
const ITST_ID = "23251"; // 방배경찰서(연등) — 서버에 고정. 쿼리로 바꿀 수 없게 해서
                          // 남이 다른 교차로 조회로 쿼터를 소진하지 못하게 한다.
const CACHE_TTL_MS = 2000;
const UPSTREAM_TIMEOUT_MS = 8000;

// 배포 후 실제 GitHub Pages 주소로 바꾸고 재배포할 것.
// 예: "https://yooeunsou.github.io" (경로 없이 origin만)
const ALLOWED_ORIGIN = "https://<GITHUB-ID>.github.io";

// 모듈 스코프 변수 — 같은 Worker 인스턴스가 재사용되는 동안만 유지되는
// best-effort 캐시. 여러 사람이 동시에 봐도 업스트림 호출을 초당 1회 이하로 줄여준다.
let cache = { at: 0, body: null };

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
}

// StatNm / RmdrCs로 끝나는 필드만 골라서 응답을 축약한다.
// (null 필드, 메타데이터, eqmnId 등은 프론트에 필요 없음)
function extractSignals(row) {
  const signals = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue;
    if (k.endsWith("StatNm") || k.endsWith("RmdrCs")) {
      signals[k] = v;
    }
  }
  return signals;
}

async function fetchUpstream(env) {
  const q = new URLSearchParams({
    apikey: env.TDATA_API_KEY, // 주의: 소문자 apikey. 대문자 apiKey는 다른 엔드포인트용.
    itstId: ITST_ID,
    type: "json",
    pageNo: "1",
    numOfRows: "1",
  });
  const r = await fetch(`${UPSTREAM}?${q}`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`upstream HTTP ${r.status}`);
  const rows = await r.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error("empty upstream response (no row for itstId)");

  return {
    itstId: row.itstId,
    // trsmUtcTime은 ms epoch(부동소수로 옴) → 정수로 반올림
    dataTime: row.trsmUtcTime ? Math.round(row.trsmUtcTime) : null,
    fetchedAt: Date.now(),
    stale: false,
    signals: extractSignals(row),
  };
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/signal") {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers,
      });
    }
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers,
      });
    }

    const now = Date.now();
    if (cache.body && now - cache.at < CACHE_TTL_MS) {
      return new Response(cache.body, { headers });
    }

    let payload;
    try {
      payload = await fetchUpstream(env);
    } catch (err) {
      // 업스트림이 5xx/타임아웃이어도 마지막 정상값을 유지한 채 200으로 응답.
      // 프론트는 stale:true를 보고 "갱신 안 됨" 경고를 낸다.
      const last = cache.body ? JSON.parse(cache.body) : null;
      payload = {
        itstId: ITST_ID,
        dataTime: last ? last.dataTime : null,
        fetchedAt: now,
        stale: true,
        signals: last ? last.signals : {},
        error: String((err && err.message) || err),
      };
    }

    const body = JSON.stringify(payload);
    cache = { at: now, body };
    return new Response(body, { headers });
  },
};
