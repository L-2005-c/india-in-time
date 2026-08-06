// Small formatting / text-safety helpers, no shared app state.

// Duration formatter (minutes -> "1h 20m" style). Used by formatTripWindow
// below and by several call sites in core/app.js.
const fmtM=m=>{if(!m||isNaN(m))return'0m';const a=Math.abs(m);return a<60?`${a}m`:`${Math.floor(a/60)}h${a%60?` ${a%60}m`:''}`;};

// Chat message HTML sanitization allow-list, passed to DOMPurify below.
const CHAT_ALLOWED_TAGS = ['strong','em','b','i','br','span','u','small','div','button','textarea'];
const CHAT_ALLOWED_ATTR = ['style','class','data-action','data-n','data-cat','data-role','data-place-id','data-place-name','data-arg','type','maxlength','rows','placeholder','aria-label','disabled'];

const COMPASS_DIRS = ['North','North-East','East','South-East','South','South-West','West','North-West'];

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function sanitizeChatHtml(html){
  const str = String(html ?? '');
  if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
    return window.DOMPurify.sanitize(str, {
      ALLOWED_TAGS: CHAT_ALLOWED_TAGS,
      ALLOWED_ATTR: CHAT_ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    });
  }
  console.warn('[security] DOMPurify unavailable \u2014 falling back to plain-text rendering for chat messages.');
  return escapeHtml(str);
}

function formatAiText(str){
  return escapeHtml(str).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
}

function formatTripWindow(days, minutesPerDay){
  return `${days} day${days===1?'':'s'} / ${fmtM(minutesPerDay)}`;
}

function fmt12(d){const h=d.getHours(),m=d.getMinutes(),ap=h>=12?'PM':'AM',hh=h%12||12,mm=String(m).padStart(2,'0');return `${hh}:${mm} ${ap}`;}

function degToCompassLabel(deg){
  return COMPASS_DIRS[Math.round(((deg%360)+360)%360/45)%8];
}

export {
  escapeHtml, sanitizeChatHtml, formatAiText, formatTripWindow, fmt12, degToCompassLabel,
  fmtM, CHAT_ALLOWED_TAGS, CHAT_ALLOWED_ATTR, COMPASS_DIRS,
};
