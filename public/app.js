(function(){
  var M=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  var TICKERS=['SPCX','TE','IREN','ASTI','ASTS','HLIT','POET','RDW','RKLB','PLTR','RDDT','ONDS','ALRIB','MC','FDJU','ADYEN','AMUN','ASML'];
  var state={filter:'ALL',sort:'score',data:null,open:{}};
  try{state.filter=localStorage.getItem('lefil.filter')||'ALL';state.sort=localStorage.getItem('lefil.sort')||'score'}catch(e){}

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function safeUrl(u){return /^https?:\/\//i.test(u||'')?u:'#'}
  function d(iso){var x=new Date(iso+'T12:00:00');return x.getDate()+' '+M[x.getMonth()]}
  
  // Hauteur du bandeau pour coller les filtres dessous
  var tape=document.getElementById('tape');
  function setTapeH(){document.documentElement.style.setProperty('--tape-h',tape.offsetHeight+'px')}
  setTimeout(setTapeH,1500); window.addEventListener('resize',setTapeH);

  function chips(){
    var h='<button class="chip" data-f="ALL">Tout</button>';
    TICKERS.forEach(function(t){h+='<button class="chip" data-f="'+t+'">'+t+'</button>'});
    var el=document.getElementById('chips');el.innerHTML=h;
    el.querySelectorAll('.chip').forEach(function(b){b.onclick=function(){setFilter(b.dataset.f)}});
  }
  function setFilter(f){state.filter=f;try{localStorage.setItem('lefil.filter',f)}catch(e){}
    document.querySelectorAll('.chip').forEach(function(b){b.classList.toggle('on',b.dataset.f===f)});
    renderFeed();
    var on=document.querySelector('.chip[data-f="'+f+'"]');if(on)on.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'})}

  /* ---------- Analyses ---------- */
  function item(a){
    var paras=String(a.summary).split(/\n\n+/).map(function(p){return '<p>'+esc(p)+'</p>'}).join('');
    var s=String(a.summary).split(/(?<=\.)\s/),first=s[0];if(first.length<90&&s[1])first+=' '+s[1];
    return '<div class="item'+(state.open[a.id]?' open':'')+'" data-id="'+esc(a.id)+'">'+
      '<button class="head"><div class="meta"><span class="dot '+esc(a.impact)+'"></span><span class="tk">'+a.tickers.map(esc).join(' · ')+'</span><span>'+d(a.date)+'</span>'+(a.score>=5?'<span class="hot">À la une</span>':'')+'</div>'+
      '<h2>'+esc(a.title)+'</h2><div class="teaser">'+esc(first)+'</div></button>'+
      '<div class="more">'+paras+(a.why?'<div class="why"><small>Pour ta position</small>'+esc(a.why)+'</div>':'')+
      '<div class="foot"><span>'+esc(a.source)+'</span>'+(a.url?'<a href="'+esc(safeUrl(a.url))+'" target="_blank" rel="noopener noreferrer">Source ↗</a>':'')+'</div></div></div>';
  }
  function renderFeed(){
    if(!state.data)return;
    document.querySelectorAll('.sortbar button').forEach(function(b){b.classList.toggle('on',b.dataset.sort===state.sort)});
    var list=state.data.articles.filter(function(a){return state.filter==='ALL'||a.tickers.indexOf(state.filter)>-1});
    list.sort(function(a,b){if(state.sort==='score'&&b.score!==a.score)return b.score-a.score;return b.date.localeCompare(a.date)});
    var f=document.getElementById('feed'),h='';
    if(!list.length){f.innerHTML='<div class="sec">Analyses</div><div class="empty">Pas encore d\'analyse sur cette valeur.</div>';return}
    if(state.sort==='score'&&state.filter==='ALL'){
      var top=list.filter(function(a){return a.score>=4}),rest=list.filter(function(a){return a.score<4});
      if(top.length)h+='<div class="sec">L\'essentiel</div>'+top.map(item).join('');
      if(rest.length)h+='<div class="sec">À suivre aussi</div>'+rest.map(item).join('');
    } else h+='<div class="sec">Analyses · '+list.length+'</div>'+list.map(item).join('');
    f.innerHTML=h;
    f.querySelectorAll('.head').forEach(function(b){b.onclick=function(){var it=b.parentNode,id=it.dataset.id;state.open[id]=!state.open[id];it.classList.toggle('open',!!state.open[id])}});
  }
  function agenda(){
    var today=new Date();today.setHours(0,0,0,0);
    var ag=(state.data.agenda||[]).filter(function(a){return new Date(a.date+'T23:59:00')>=today});
    if(!ag.length)return;
    document.getElementById('agendaWrap').innerHTML='<div class="sec">Agenda</div><div class="ag">'+ag.map(function(a){return '<div class="d">'+d(a.date)+'</div><div class="t">'+esc(a.t)+'</div><div>'+esc(a.label)+'</div>'}).join('')+'</div>';
  }
  function loadData(){
    fetch('data.json',{cache:'no-store'}).then(function(r){return r.json()}).then(function(x){
      state.data=x;document.getElementById('upd').textContent='Analyses : '+(x.updated_label||x.updated);renderFeed();agenda();
    }).catch(function(){});
  }

  document.querySelectorAll('.sortbar button').forEach(function(b){b.onclick=function(){state.sort=b.dataset.sort;try{localStorage.setItem('lefil.sort',state.sort)}catch(e){};renderFeed()}});

  chips(); setFilter(TICKERS.indexOf(state.filter)>-1?state.filter:'ALL');
  loadData();
  setInterval(loadData,30*60*1000);          // recharge les analyses toutes les 30 min
  document.addEventListener('visibilitychange',function(){if(!document.hidden)loadData()});
})();
