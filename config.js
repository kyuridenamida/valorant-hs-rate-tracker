// HS Tracker 設定ファイル
// WEBHOOK_URL をあなたのエンドポイントに書き換えてください
const CONFIG = {
  WEBHOOK_URL: 'YOUR_WEBHOOK_URL_HERE',

  WEBHOOK_EVENTS: {
    ON_KILL: true,       // キル発生ごとに送信
    ON_MATCH_END: true,  // マッチ終了時に送信
    PERIODIC: false,     // 定期的に送信（下のINTERVALで設定）
  },

  PERIODIC_INTERVAL_SEC: 30,

  MAX_RECENT_KILLS: 6,

  // HS率がこの値（%）を下回ると DANGER 状態になる
  HS_THRESHOLD: 50,

  // オーバーレイ表示制御
  SHOW_ON_DEATHMATCH_ONLY: true,
};
