const escape = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function emailContent(body, base, token) {
  const links = [];
  const chunks = String(body).split(/(https?:\/\/[^\s<>"']+)/gi);
  const plain = [...chunks];
  const html = chunks.map((part, index) => {
    if (!index || index % 2 === 0) return escape(part);
    const url = part.replace(/[.,;!?)]*$/, ''), tail = part.slice(url.length);
    try { const parsed = new URL(url); if (parsed.username || parsed.password) return escape(part); } catch { return escape(part); }
    const href = base ? `${base}/track/${token}/click/${links.push(url) - 1}` : url;
    plain[index] = href + tail;
    return `<a href="${escape(href)}">${escape(url)}</a>${escape(tail)}`;
  }).join('').replace(/\r?\n/g, '<br>');
  return { links, text: plain.join(''), html: `${html}${base ? `<img alt="" width="1" height="1" src="${escape(`${base}/track/${token}/open`)}">` : ''}` };
}
function metrics(rows) {
  const sent = rows.filter(row => row.status === 'Sent');
  const trackable = sent.filter(row => row.mode === 'Email' && row.token);
  const opened = trackable.filter(row => row.openedat).length, clicked = trackable.filter(row => row.clickedat).length;
  return { total: rows.length, sent: sent.length, failed: rows.filter(row => row.status === 'Failed').length, unknown: rows.filter(row => ['Unknown', 'Pending'].includes(row.status)).length, trackable: trackable.length, opened, clicked, ctr: trackable.length ? Number((100 * clicked / trackable.length).toFixed(2)) : null };
}
function trackingOrigin(value) {
  if (typeof value !== 'string') throw Error('Enter a public HTTPS backend URL');
  const input = value.trim();
  if (!input) return '';
  let url;
  try { url = new URL(input); } catch { throw Error('Enter a valid public HTTPS backend URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !url.hostname.includes('.') || require('node:net').isIP(url.hostname) || /^localhost\.|\.localhost\.?$|\.local\.?$/i.test(url.hostname)) throw Error('Enter the public HTTPS backend origin without a path, query, or credentials');
  return url.origin;
}
module.exports = { emailContent, metrics, trackingOrigin };
