(function(){
  var start=Date.parse("2026-10-19T17:00:00Z");
  var end=Date.parse("2026-10-26T17:00:00Z");
  var now=Date.now();
  document.querySelectorAll("[data-event-status]").forEach(function(el){
    var ko=el.closest("[lang=ko]")!==null;
    el.textContent=now<start?(ko?"데모 시작 예정":"Demo upcoming"):now<end?(ko?"데모 진행 중":"Demo now live"):(ko?"데모 기간 종료":"Demo period ended");
  });
}());