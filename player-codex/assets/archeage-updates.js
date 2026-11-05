/* Read-only publisher feed. The GitHub Actions Steam sync refreshes this JSON;
   community claims are never elevated to verified guide facts automatically. */
(function () {
  "use strict";
  var targets = document.querySelectorAll("[data-pc-official-feed]");
  if (!targets.length) return;
  var ko = document.documentElement.lang === "ko";
  function publisherUrl(value) {
    try {
      var u = new URL(value);
      return u.protocol === "https:" && (
        (u.hostname === "steamstore-a.akamaihd.net" && /^\\/news\\/externalpost\\/steam_community_announcements\\/\\d+$/.test(u.pathname)) ||
        (u.hostname === "steamcommunity.com" && /^\\/(?:games|app)\\/3218230\\//.test(u.pathname))
      ) ? u.href : "";
    } catch (e) { return ""; }
  }
  function fill(element, items) {
    var result = document.createDocumentFragment();
    items.slice(0, 3).forEach(function (item) {
      var url = publisherUrl(item.url);
      if (!url || typeof item.title !== "string" || typeof item.published_at !== "string") return;
      var a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      var time = document.createElement("time");
      time.dateTime = item.published_at;
      var d = new Date(item.published_at);
      time.textContent = Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {month: "short", day: "numeric", timeZone: "UTC"}).format(d);
      var title = document.createElement("span");
      title.textContent = item.title.length > 100 ? item.title.slice(0, 100) + "…" : item.title;
      a.append(time, title);
      result.appendChild(a);
    });
    if (result.childNodes.length) element.replaceChildren(result);
  }
  fetch("/player-codex/archeage-chronicles/data/official-news.json", {cache: "no-cache"})
    .then(function (r) { if (!r.ok) throw Error("Publisher feed unavailable"); return r.json(); })
    .then(function (data) {
      if (data.game !== "archeage-chronicles" || data.appid !== 3218230 || !Array.isArray(data.items)) return;
      var items = data.items.slice().filter(function (v) { return v && typeof v === "object" && publisherUrl(v.url); })
        .sort(function (a, b) { return Date.parse(b.published_at) - Date.parse(a.published_at); });
      targets.forEach(function (target) { fill(target, items); });
      var latest = items[0] && new Date(items[0].published_at);
      if (latest && !Number.isNaN(latest.getTime())) {
        document.querySelectorAll("[data-pc-news-date]").forEach(function (element) {
          var dateText = new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC"}).format(latest);
          element.textContent = (ko ? "최근 공식 공지 게시: " : "Latest publisher post: ") + dateText + " UTC · " + (ko ? "서버 실시간 상태 아님" : "Not a live server-status check");
        });
      }
    }).catch(function () { /* Keep the source-linked fallback already in HTML. */ });
}());
