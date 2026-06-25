/* OpenSO news/blog engine.
 *
 * Posts live as Markdown in news/posts/<slug>.md, indexed by news/feed.json:
 *   { "posts": [ { "slug", "title", "date" (ISO yyyy-mm-dd), "author", "summary", "tags": [], "image" } ] }
 *
 * news.html lists the feed; post.html?p=<slug> renders one post.
 *
 * THE LAUNCHER hooks the SAME feed: GET https://openso.org/news/feed.json -> show recent posts; open
 * https://openso.org/post.html?p=<slug> for the full article. Image/url paths in the feed are site-root
 * relative (e.g. /assets/x.png) — prepend the site origin when consuming from the launcher.
 */
(function () {
  const FEED_URL = 'news/feed.json';
  const POSTS_DIR = 'news/posts/';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  async function loadFeed() {
    const res = await fetch(FEED_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('feed ' + res.status);
    const data = await res.json();
    return (data.posts || []).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  async function renderList(el) {
    try {
      const posts = await loadFeed();
      if (!posts.length) { el.innerHTML = '<p class="sub">No posts yet — check back soon.</p>'; return; }
      el.innerHTML = posts.map(p => `
        <a class="news-card" href="post.html?p=${encodeURIComponent(p.slug)}">
          ${p.image ? `<div class="news-thumb" style="background-image:url('${esc(p.image)}')"></div>` : ''}
          <div class="news-body">
            <div class="news-meta">${fmtDate(p.date)}${p.author ? ' · ' + esc(p.author) : ''}</div>
            <h3>${esc(p.title)}</h3>
            <p>${esc(p.summary || '')}</p>
            ${(p.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
          </div>
        </a>`).join('');
    } catch (e) {
      el.innerHTML = '<p class="msg show error">Could not load news right now.</p>';
    }
  }

  async function renderPost(el) {
    const slug = new URLSearchParams(location.search).get('p');
    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) { el.innerHTML = '<a class="back" href="news.html">← All news</a><p>Post not found.</p>'; return; }
    try {
      const posts = await loadFeed();
      const meta = posts.find(p => p.slug === slug) || { title: slug, date: '', author: '' };
      const res = await fetch(POSTS_DIR + slug + '.md', { cache: 'no-cache' });
      if (!res.ok) throw new Error('post ' + res.status);
      const md = await res.text();
      document.title = meta.title + ' — OpenSO News';
      el.innerHTML =
        '<a class="back" href="news.html">← All news</a>' +
        `<div class="news-meta">${fmtDate(meta.date)}${meta.author ? ' · ' + esc(meta.author) : ''}</div>` +
        `<h1 class="post-title">${esc(meta.title)}</h1>` +
        `<div class="post-content">${mdToHtml(md)}</div>`;
    } catch (e) {
      el.innerHTML = '<a class="back" href="news.html">← All news</a><p>This post could not be loaded.</p>';
    }
  }

  /* Minimal Markdown -> HTML. Posts are authored by the team (trusted content), so the result is injected
     directly. Supported: #..###### headings, - / * and 1. lists, > blockquotes, ``` fenced code, --- hr,
     ![alt](src) images, [text](url) links, **bold**, *italic* / _italic_, `code`, paragraphs. */
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_([^_\n]+)_/g, '$1<em>$2</em>');
    return s;
  }

  function mdToHtml(md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    let html = '', i = 0;
    const blockStart = /^(#{1,6}\s|```|\s*>|\s*[-*]\s|\s*\d+\.\s|\s*(?:---|\*\*\*)\s*$)/;
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {                                  // fenced code
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(esc(lines[i])); i++; }
        i++; html += '<pre><code>' + buf.join('\n') + '</code></pre>'; continue;
      }
      if (/^\s*$/.test(line)) { i++; continue; }                // blank
      let m;
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {              // heading
        html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; i++; continue;
      }
      if (/^\s*(---|\*\*\*)\s*$/.test(line)) { html += '<hr>'; i++; continue; }  // hr
      if (/^\s*>/.test(line)) {                                 // blockquote
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        html += '<blockquote>' + inline(buf.join(' ')) + '</blockquote>'; continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {                           // unordered list
        const buf = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { buf.push('<li>' + inline(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>'); i++; }
        html += '<ul>' + buf.join('') + '</ul>'; continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {                          // ordered list
        const buf = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { buf.push('<li>' + inline(lines[i].replace(/^\s*\d+\.\s+/, '')) + '</li>'); i++; }
        html += '<ol>' + buf.join('') + '</ol>'; continue;
      }
      const buf = [];                                          // paragraph
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !blockStart.test(lines[i])) { buf.push(lines[i]); i++; }
      html += '<p>' + inline(buf.join(' ')) + '</p>';
    }
    return html;
  }

  window.OpenSONews = { renderList, renderPost, loadFeed, mdToHtml, FEED_URL };
})();
