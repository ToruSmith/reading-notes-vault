/**
 * Svg.gs — SVG 上傳清除（規劃書 5.3、風險表）
 *
 * 做法：把 SVG 逐字切成「標籤、文字、註解」權杖，再重新組出安全版本。
 * 不用正規表示式整段取代，因為那種做法很容易被大小寫、換行、實體編碼繞過。
 *
 * 清除項目
 *  - 元素：script、foreignObject（含其底下所有子孫）
 *  - 屬性：所有 on 開頭的事件屬性
 *  - 連結：href、xlink:href 等的值若為 javascript:、vbscript:、data:text/html，或任何外部網址（http(s)、//…），移除該屬性
 *  - 動畫：animate／set 若要改 href 或 on* 屬性，整個元素移除
 *  - CSS：<style> 與 style 屬性內的 @import、expression()、javascript:、指向外部的 url() 一律中和
 *  - CDATA：樣式表以外的位置轉成純文字
 *  - 註解、處理指令、DOCTYPE（含實體宣告）一律移除
 * 格式不合法（標籤沒配對、不是 svg 根元素、有 <!ENTITY）則直接拒絕，不嘗試修補。
 *
 * 已知限制：顯示一律用 <img>，瀏覽器在該模式下本來就不執行腳本、不載入外部資源，
 * 這裡是第二層防線。<style> 只中和已知的危險寫法，不做完整 CSS 解析。
 */

var SVG_BLOCKED_ELEMENTS_ = { script: 1, foreignobject: 1 };
var SVG_URL_ATTRS_ = { href: 1, 'xlink:href': 1, src: 1, action: 1, formaction: 1 };

function svgLocalName_(name) {
  const i = name.indexOf(':');
  return (i >= 0 ? name.slice(i + 1) : name).toLowerCase();
}

/** 還原數字實體與常見具名實體後，去掉控制字元與空白，用來偵測被編碼藏起來的 javascript: */
function svgNormalizeUrl_(v) {
  let s = String(v)
    .replace(/&#x([0-9a-f]+);?/gi, function (m, h) {
      return String.fromCharCode(parseInt(h, 16));
    })
    .replace(/&#(\d+);?/g, function (m, d) {
      return String.fromCharCode(parseInt(d, 10));
    })
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '')
    .replace(/&newline;/gi, '');
  return s.replace(/[\u0000-\u0020\u007f-\u009f]+/g, '').toLowerCase();
}

function svgIsDangerousUrl_(v) {
  const s = svgNormalizeUrl_(v);
  return s.indexOf('javascript:') === 0 || s.indexOf('vbscript:') === 0 || s.indexOf('data:text/html') === 0;
}

/** 外部參照：任何帶協定（http:、https:、ftp:、file: 等）或 // 開頭的網址。內部錨點（#id）與相對路徑不算。 */
function svgIsExternalUrl_(v) {
  const s = svgNormalizeUrl_(v);
  return /^[a-z][a-z0-9+.-]*:/.test(s) || s.indexOf('//') === 0;
}

/** 清除 CSS 裡會載入外部資源或執行腳本的寫法：@import、expression()、javascript:、指向外部的 url()。 */
function svgCleanCss_(css, removed) {
  let hit = false;
  const NEST = '(?:[^()]|\\([^()]*\\))*'; // 允許括號內再有一層括號，例如 url(javascript:alert(1))
  const out = String(css)
    .replace(/@import[^;{]*;?/gi, function () {
      hit = true;
      return '';
    })
    .replace(new RegExp('expression\\s*\\(' + NEST + '\\)', 'gi'), function () {
      hit = true;
      return 'none';
    })
    .replace(new RegExp('url\\s*\\((' + NEST + ')\\)', 'gi'), function (m, u) {
      if (svgNormalizeUrl_(u.replace(/^\s*['"]|['"]\s*$/g, '')).indexOf('#') === 0) return m;
      hit = true;
      return 'none';
    })
    .replace(/(?:java|vb)script\s*:/gi, function () {
      hit = true;
      return 'blocked:';
    });
  if (hit && removed) removed.push('CSS 外部參照或腳本');
  return out;
}

/** 讀出標籤結尾位置，引號內的 > 不算結尾。回傳 -1 表示沒結尾。 */
function svgFindTagEnd_(src, from) {
  let q = null;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '>') return i;
  }
  return -1;
}

function svgParseAttrs_(inner) {
  const attrs = [];
  const re = /([^\s=\/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+)))?/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    const v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    attrs.push({ name: m[1], value: v });
  }
  return attrs;
}

function sanitizeSvg_(source) {
  if (typeof source !== 'string' || source.trim() === '') return { ok: false, reason: 'SVG 內容是空的' };
  let src = source.replace(/^\uFEFF/, '');
  if (/<!ENTITY/i.test(src)) return { ok: false, reason: 'SVG 含有實體宣告，已拒絕' };

  const out = [];
  const stack = [];
  const removed = [];
  let skipLevel = null; // 正在跳過被封鎖元素時，記錄它的深度
  let rasterFound = false; // 是否出現內嵌點陣圖（data:image/png 等）
  let rootSeen = false,
    rootClosed = false;
  let i = 0;

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const text = lt === -1 ? src.slice(i) : src.slice(i, lt);
    if (text !== '') {
      if (stack.length === 0 && text.trim() !== '') return { ok: false, reason: 'SVG 根元素之外有多餘文字' };
      if (skipLevel === null && stack.length > 0)
        out.push(svgLocalName_(stack[stack.length - 1]) === 'style' ? svgCleanCss_(text, removed) : text);
    }
    if (lt === -1) break;

    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      if (e === -1) return { ok: false, reason: '註解沒有結尾' };
      i = e + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      if (e === -1) return { ok: false, reason: 'CDATA 沒有結尾' };
      if (skipLevel === null && stack.length > 0) {
        // CDATA：樣式表內清理後保留；其他位置一律轉成純文字，避免夾帶標記
        const raw = src.slice(lt + 9, e);
        if (svgLocalName_(stack[stack.length - 1]) === 'style')
          out.push('<![CDATA[' + svgCleanCss_(raw, removed) + ']]>');
        else out.push(raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      }
      i = e + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2);
      if (e === -1) return { ok: false, reason: '處理指令沒有結尾' };
      i = e + 2;
      continue;
    }
    if (/^<!doctype/i.test(src.substr(lt, 10))) {
      const e = svgFindTagEnd_(src, lt + 2);
      if (e === -1 || src.slice(lt, e).indexOf('[') !== -1) return { ok: false, reason: 'DOCTYPE 不合法' };
      i = e + 1;
      continue;
    }

    const end = svgFindTagEnd_(src, lt + 1);
    if (end === -1) return { ok: false, reason: '標籤沒有結尾' };
    let inner = src.slice(lt + 1, end);
    i = end + 1;

    if (inner[0] === '/') {
      // 結束標籤
      const name = inner.slice(1).trim();
      if (stack.length === 0 || stack[stack.length - 1] !== name)
        return { ok: false, reason: '標籤沒有正確配對：' + name };
      const wasSkipping = skipLevel !== null;
      stack.pop();
      if (skipLevel !== null && stack.length < skipLevel) skipLevel = null;
      if (!wasSkipping) out.push('</' + name + '>');
      if (stack.length === 0) rootClosed = true;
      continue;
    }

    const selfClose = /\/\s*$/.test(inner);
    if (selfClose) inner = inner.replace(/\/\s*$/, '');
    const nm = /^[^\s\/>]+/.exec(inner);
    if (!nm) return { ok: false, reason: '標籤名稱不合法' };
    const name = nm[0];
    const local = svgLocalName_(name);

    if (stack.length === 0) {
      if (rootClosed) return { ok: false, reason: 'SVG 只能有一個根元素' };
      if (local !== 'svg') return { ok: false, reason: '根元素必須是 svg' };
      rootSeen = true;
    }

    let blocked = SVG_BLOCKED_ELEMENTS_[local] === 1;
    if (!blocked && (local === 'animate' || local === 'set')) {
      // 動畫不得去改連結或事件屬性（animate/set 能把 href 改成 javascript:）
      svgParseAttrs_(inner.slice(name.length)).forEach(function (a) {
        if (a.name.toLowerCase() !== 'attributename') return;
        const v = svgNormalizeUrl_(a.value);
        if (SVG_URL_ATTRS_[v] === 1 || v.indexOf('on') === 0) blocked = true;
      });
    }
    if (skipLevel === null && blocked) {
      removed.push('<' + local + '>');
      if (!selfClose) {
        stack.push(name);
        skipLevel = stack.length;
      }
      continue;
    }
    if (skipLevel !== null) {
      // 仍在被封鎖元素內：只追蹤深度，不輸出
      if (!selfClose) stack.push(name);
      continue;
    }

    let attrs = svgParseAttrs_(inner.slice(name.length));
    const kept = [];
    attrs.forEach(function (a) {
      const an = a.name.toLowerCase();
      if (an.indexOf('on') === 0) {
        removed.push('屬性 ' + an);
        return;
      }
      if (SVG_URL_ATTRS_[an] === 1 && /^data:image\/(?!svg\+xml)/.test(svgNormalizeUrl_(a.value))) {
        rasterFound = true;
        return;
      }
      if (SVG_URL_ATTRS_[an] === 1 && svgIsDangerousUrl_(a.value)) {
        removed.push('危險連結 ' + an);
        return;
      }
      if (SVG_URL_ATTRS_[an] === 1 && svgIsExternalUrl_(a.value)) {
        removed.push('外部連結 ' + an);
        return;
      }
      if (an === 'style') a = { name: a.name, value: svgCleanCss_(a.value, removed) };
      kept.push(a);
    });
    if (rasterFound) return { ok: false, reason: 'SVG 含內嵌點陣圖（base64），已拒絕；本專案不處理點陣圖' };
    if (
      stack.length === 0 &&
      !kept.some(function (a) {
        return a.name.toLowerCase() === 'xmlns';
      })
    ) {
      kept.unshift({ name: 'xmlns', value: 'http://www.w3.org/2000/svg' }); // <img> 顯示需要命名空間
    }
    const attrText = kept
      .map(function (a) {
        return ' ' + a.name + '="' + String(a.value).replace(/"/g, '&quot;') + '"';
      })
      .join('');
    out.push('<' + name + attrText + (selfClose ? '/>' : '>'));
    if (!selfClose) stack.push(name);
    else if (stack.length === 0) rootClosed = true;
  }

  if (!rootSeen) return { ok: false, reason: '找不到 svg 根元素' };
  if (stack.length !== 0) return { ok: false, reason: '標籤沒有全部關閉' };
  return { ok: true, svg: out.join(''), removed: removed };
}
