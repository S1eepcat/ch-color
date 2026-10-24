/* =========================================================
   中国传统色 · 五色成文
   交互脚本（无依赖，纯原生 JS）
     1. 顶部阅读进度条
     2. 判断当前分区：更新 HUD、侧栏、界面明暗
     3. 滚动视差：黄章节横向漂移 / 白章节圆环 / 黑章节墨晕
     4. IntersectionObserver 控制逐条显现
     5. 点击复制色值
   ========================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $ = function (selector, ctx) {
    return (ctx || document).querySelector(selector);
  };
  var $$ = function (selector, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(selector));
  };

  var bar = $('.progress__bar');
  var hudDot = $('.hud__dot');
  var hudName = $('.hud__name');
  var hudHex = $('.hud__hex');
  var toast = $('.toast');

  // body 上也有 data-tone（用来切换界面明暗），必须排除，否则永远命中整页
  var sections = $$('[data-tone]').filter(function (el) {
    return el !== document.body;
  });
  var chapters = $$('.chapter');
  var railLinks = $$('.rail a');
  var shifters = $$('[data-shift]');

  var rafId = 0;
  var lastHudKey = '';
  var lastTone = '';
  var lastChapter = '';

  /* ---------- 当前分区 ---------- */

  // 取“穿过视口中线”的那个分区，比 IntersectionObserver 更适合做整页变色
  function sectionAt(centerY) {
    for (var i = 0; i < sections.length; i += 1) {
      var rect = sections[i].getBoundingClientRect();
      if (centerY >= rect.top && centerY < rect.bottom) return sections[i];
    }
    return sections[sections.length - 1];
  }

  function updateHud(active) {
    var tone = active.getAttribute('data-tone') || 'dark';
    if (tone !== lastTone) {
      document.body.setAttribute('data-tone', tone);
      lastTone = tone;
    }

    var name = active.getAttribute('data-name') || '';
    var hex = active.getAttribute('data-hex') || '';
    var key = name + '|' + hex;

    if (key !== lastHudKey) {
      lastHudKey = key;
      hudName.textContent = name;
      hudHex.textContent = hex;
      hudDot.style.setProperty('--dot', active.getAttribute('data-dot') || 'transparent');
    }

    document.body.classList.toggle('has-hud', window.scrollY > window.innerHeight * 0.4);
  }

  function updateRail(centerY) {
    var found = '';
    for (var i = 0; i < chapters.length; i += 1) {
      var rect = chapters[i].getBoundingClientRect();
      if (centerY >= rect.top && centerY < rect.bottom) {
        found = chapters[i].id;
        break;
      }
    }
    if (found === lastChapter) return;
    lastChapter = found;
    railLinks.forEach(function (link) {
      link.classList.toggle('is-active', link.getAttribute('data-nav') === found);
    });
  }

  /* ---------- 滚动视差 ---------- */

  // 把每个 [data-shift] 分区的滚动进度写进 CSS 变量 --p（0 → 1）
  // 具体位移方向由 CSS 决定，JS 只负责算进度
  function updateShift() {
    if (reduceMotion) return;
    var vh = window.innerHeight;
    shifters.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > vh + 200) return; // 屏幕外跳过
      var progress = (vh - rect.top) / (vh + rect.height);
      el.style.setProperty('--p', Math.min(Math.max(progress, 0), 1).toFixed(4));
    });
  }

  /* ---------- 每帧更新 ---------- */

  function onFrame() {
    rafId = 0;

    var vh = window.innerHeight;
    var centerY = vh / 2;

    // 先读取布局，再写样式，避免同一帧内强制重排
    var active = sectionAt(centerY);

    updateShift();
    updateHud(active);
    updateRail(centerY);

    var scrollable = document.documentElement.scrollHeight - vh;
    var ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
    bar.style.transform = 'scaleX(' + Math.min(Math.max(ratio, 0), 1) + ')';
  }

  function requestFrame() {
    if (!rafId) rafId = window.requestAnimationFrame(onFrame);
  }

  window.addEventListener('scroll', requestFrame, { passive: true });
  window.addEventListener('resize', requestFrame, { passive: true });
  window.addEventListener('load', requestFrame);
  requestFrame();

  /* ---------- 进入视口时显现 ---------- */
  // 优先使用 IntersectionObserver；不支持时直接把所有内容显示出来
  var scopes = $$('.reveal-scope');

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' }
    );

    scopes.forEach(function (el) {
      io.observe(el);
    });
  } else {
    scopes.forEach(function (el) {
      el.classList.add('is-in');
    });
  }

  /* ---------- 点击复制色值 ---------- */
  var toastTimer = 0;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-on');
    }, 1900);
  }

  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard
        .writeText(text)
        .then(function () {
          return true;
        })
        .catch(function () {
          return fallbackCopy(text);
        });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-copy]');
    if (!trigger) return;

    var hex = trigger.getAttribute('data-copy');
    copyText(hex).then(function (ok) {
      showToast(ok ? '已复制 ' + hex.toUpperCase() : '复制失败，请手动选择色值');
    });
  });
})();
