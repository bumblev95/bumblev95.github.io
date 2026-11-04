/* Load third-party creator playback only when a visitor chooses Play. */
(function () {
  "use strict";
  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var play = target.closest("button[data-community-play]");
    if (!play) return;
    var videoId = play.getAttribute("data-community-play") || "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;
    var poster = play.closest(".live-community-poster");
    if (!poster) return;
    var player = document.createElement("iframe");
    player.title = play.getAttribute("data-video-title") || "Community gameplay video";
    player.src = "https://www.youtube-nocookie.com/embed/" + videoId + "?autoplay=1&rel=0";
    player.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; web-share");
    player.setAttribute("allowfullscreen", "");
    player.setAttribute("loading", "eager");
    player.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    poster.replaceChildren(player);
  });
}());
