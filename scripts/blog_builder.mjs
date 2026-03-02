import fs from 'fs';
import path from 'path';

const BLOG_DIR = path.resolve('blog');
const POSTS_DIR = path.join(BLOG_DIR, 'posts');
const INDEX_FILE = path.join(BLOG_DIR, 'index.json');
const RSS_FILE = path.join(BLOG_DIR, 'rss.xml');
const SITEMAP_FILE = path.join(BLOG_DIR, 'sitemap.xml');
const baseUrl = 'https://pay.vagalimitada.com';
const BLOG_ASSETS_ORIGIN = 'https://assets.vagalimitada.com';

function ensureDirs() {
  if (!fs.existsSync(POSTS_DIR)) {
    fs.mkdirSync(POSTS_DIR, { recursive: true });
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function absolutizeAssetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  let value = raw;
  if (value.startsWith('./')) value = value.slice(2);
  while (value.startsWith('../')) value = value.slice(3);
  if (value.startsWith('/blog/')) return `${BLOG_ASSETS_ORIGIN}${value}`;
  if (value.startsWith('blog/')) return `${BLOG_ASSETS_ORIGIN}/${value}`;
  if (value.startsWith('/assets/')) return `${BLOG_ASSETS_ORIGIN}/blog${value}`;
  if (value.startsWith('assets/')) return `${BLOG_ASSETS_ORIGIN}/blog/${value}`;
  return value;
}

function rewriteSrcset(srcset) {
  return String(srcset || '')
    .split(',')
    .map(part => {
      const trimmed = part.trim();
      if (!trimmed) return '';
      const pieces = trimmed.split(/\s+/);
      const url = absolutizeAssetUrl(pieces[0]);
      const descriptor = pieces.slice(1).join(' ');
      return descriptor ? `${url} ${descriptor}` : url;
    })
    .filter(Boolean)
    .join(', ');
}

function rewriteTagAttributes(html, tagName) {
  const tagRegex = new RegExp(`<${tagName}[^>]*>`, 'gi');
  return String(html || '').replace(tagRegex, tag => {
    let updated = tag;
    updated = updated.replace(/\s(src|srcset)=["']([^"']+)["']/gi, (match, attr, value) => {
      const fixed = attr.toLowerCase() === 'srcset' ? rewriteSrcset(value) : absolutizeAssetUrl(value);
      return ` ${attr}="${fixed}"`;
    });
    return updated;
  });
}

function rewriteHtmlAssets(html) {
  let updated = String(html || '');
  updated = rewriteTagAttributes(updated, 'img');
  updated = rewriteTagAttributes(updated, 'source');
  return updated;
}

function getShopeeItems(post) {
  if (Array.isArray(post.shopee_recommendations)) return post.shopee_recommendations;
  if (Array.isArray(post.shopee?.searches)) return post.shopee.searches;
  return [];
}

function isValidHttpUrl(url) {
  const value = String(url || '').trim();
  return /^https?:\/\//i.test(value);
}

function extractMaterialLabel(liHtml) {
  const boldMatch = liHtml.match(/<b[^>]*>([\s\S]*?)<\/b>/i);
  if (boldMatch && boldMatch[1]) {
    return boldMatch[1].replace(/[:\s]+$/, '').trim();
  }
  const text = liHtml.replace(/<[^>]*>/g, ' ');
  const parts = text.split(':');
  return (parts[0] || text).trim();
}

function buildFallbackSearchUrl(term, shopeeItems) {
  const keyword = encodeURIComponent(term || '');
  const reference = shopeeItems.find(item => isValidHttpUrl(item.search_url));
  if (reference && reference.search_url) {
    try {
      const url = new URL(reference.search_url);
      url.searchParams.set('keyword', term);
      return url.toString();
    } catch {}
  }
  return `https://shopee.com.br/search?keyword=${keyword}`;
}

function ensureUlClass(ulHtml, className) {
  if (/class=["'][^"']*materials-ul[^"']*["']/i.test(ulHtml)) return ulHtml;
  if (/class=["'][^"']*["']/i.test(ulHtml)) {
    return ulHtml.replace(/class=["']([^"']*)["']/, (match, classes) => `class="${classes} ${className}"`);
  }
  return ulHtml.replace('<ul', `<ul class="${className}"`);
}

function enrichMaterialsUlWithThumbs(html, shopeeItems) {
  const source = String(html || '');
  if (!source) return source;
  const headingRegex = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRegex.exec(source)) !== null) {
    const headingText = normalizeText(match[2] || '');
    if (!headingText.includes('materiais')) continue;
    const afterHeadingIndex = match.index + match[0].length;
    const afterHeading = source.slice(afterHeadingIndex);
    const ulMatch = afterHeading.match(/<ul[\s\S]*?<\/ul>/i);
    const nextHeading = afterHeading.match(/<h[23][^>]*>/i);
    if (!ulMatch) return source;
    if (nextHeading && nextHeading.index !== null && nextHeading.index < ulMatch.index) {
      continue;
    }
    const ulHtml = ulMatch[0];
    const updatedUl = ensureUlClass(ulHtml, 'materials-ul').replace(/<li[^>]*>[\s\S]*?<\/li>/gi, li => {
      const nameLabel = extractMaterialLabel(li);
      const nameNormalized = normalizeText(nameLabel);
      const hasThumb = /class=["'][^"']*material-thumb[^"']*["']/i.test(li);
      const hasBody = /class=["'][^"']*material-body[^"']*["']/i.test(li);
      const candidate = shopeeItems.find(item => {
        const keyword = normalizeText(item.keyword_used || '');
        if (!keyword) return false;
        return keyword.includes(nameNormalized) || nameNormalized.includes(keyword);
      });
      const imageUrl = candidate?.image_url ? absolutizeAssetUrl(candidate.image_url) : `${BLOG_ASSETS_ORIGIN}/blog/assets/ui/placeholder-item.jpg`;
      const offerUrl = candidate?.offer_url && isValidHttpUrl(candidate.offer_url) ? candidate.offer_url : null;
      const searchUrl = candidate?.search_url && isValidHttpUrl(candidate.search_url)
        ? candidate.search_url
        : buildFallbackSearchUrl(nameLabel, shopeeItems);
      const linkUrl = offerUrl || searchUrl;
      const hasLink = /<a\s/i.test(li);
      let updatedLi = li;
      if (hasLink && offerUrl) {
        updatedLi = updatedLi.replace(/href=["'][^"']*["']/, `href="${offerUrl}"`);
      }
      if (!hasLink && linkUrl) {
        updatedLi = updatedLi.replace(/<\/li>/i, `<br><a href="${linkUrl}" target="_blank" rel="nofollow noopener">Ver produto recomendado</a></li>`);
      }
      if (!hasBody) {
        updatedLi = updatedLi.replace(/<li([^>]*)>/i, (match, attrs) => {
          if (/class=["'][^"']*["']/.test(attrs)) {
            return `<li${attrs.replace(/class=["']([^"']*)["']/, (m, cls) => ` class="${cls} material-li"`)}>`;
          }
          return `<li${attrs} class="material-li">`;
        });
        updatedLi = updatedLi.replace(/<li[^>]*>([\s\S]*?)<\/li>/i, (matchAll, inner) => {
          const body = `<div class="material-body">${inner}</div>`;
          if (hasThumb) return `<li class="material-li">${body}</li>`;
          const thumb = `<img class="material-thumb" src="${imageUrl}" alt="${nameLabel || 'Material'}" loading="lazy" onerror="this.remove()">`;
          return `<li class="material-li">${thumb}${body}</li>`;
        });
      }
      return updatedLi;
    });
    const start = afterHeadingIndex + (ulMatch.index || 0);
    const end = start + ulHtml.length;
    return source.slice(0, start) + updatedUl + source.slice(end);
  }
  return source;
}

function removeShopeeGrid(html) {
  let output = String(html || '');
  const headingRegex = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRegex.exec(output)) !== null) {
    const headingText = normalizeText(match[2] || '');
    if (!headingText.includes('materiais na shopee')) continue;
    const start = match.index;
    const after = output.slice(start + match[0].length);
    const nextHeading = after.match(/<h[23][^>]*>/i);
    const end = nextHeading && nextHeading.index !== null
      ? start + match[0].length + nextHeading.index
      : output.length;
    output = output.slice(0, start) + output.slice(end);
    headingRegex.lastIndex = 0;
  }
  return output;
}

function readPosts() {
  ensureDirs();
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.json'));
  const posts = [];
  for (const file of files) {
    const filePath = path.join(POSTS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const post = JSON.parse(content);
      let modified = false;

      const filenameBase = path.basename(file, '.json');
      if (post.slug !== filenameBase) {
        post.slug = filenameBase;
        modified = true;
      }

      if (post.image && !post.cover) {
        post.cover = post.image;
        modified = true;
      }

      if (post.content && !post.content_html) {
        post.content_html = post.content;
        modified = true;
      }

      if (post.content_html) {
        const shopeeItems = getShopeeItems(post);
        const withAssets = rewriteHtmlAssets(post.content_html);
        const withoutGrid = removeShopeeGrid(withAssets);
        const enriched = enrichMaterialsUlWithThumbs(withoutGrid, shopeeItems);
        if (enriched !== post.content_html) {
          post.content_html = enriched;
          modified = true;
        }
      }

      if (!post.date_iso) {
        if (post.date) {
          post.date_iso = `${post.date}T12:00:00-03:00`;
        } else {
          post.date_iso = new Date().toISOString();
        }
        modified = true;
      }

      if (!post.date_display) {
        try {
          const d = new Date(post.date_iso);
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          post.date_display = `${day}/${month}/${year} às ${hours}:${minutes}`;
        } catch {
          post.date_display = post.date || "Data desconhecida";
        }
        modified = true;
      }

      if (!post.id) {
        post.id = post.slug;
        modified = true;
      }

      const normalizedStatus = normalizeStatus(post.status);
      if (post.status !== normalizedStatus) {
        post.status = normalizedStatus;
        modified = true;
      }

      if (post.cta_button_text !== 'Acesse os Modelos de Crochê Agora!') {
        post.cta_button_text = 'Acesse os Modelos de Crochê Agora!';
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
      }

      if (post.slug && post.title) {
        posts.push(post);
      }
    } catch (error) {
      console.error(`Error processing file ${file}:`, error.message);
    }
  }
  posts.sort((a, b) => new Date(getPostDate(b)) - new Date(getPostDate(a)));
  return posts;
}

function getPostDate(post) {
  return post.date_iso || post.date || new Date().toISOString();
}

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase().trim();
  if (value === 'published' || value === 'archived' || value === 'draft') {
    return value;
  }
  return 'published';
}

function onlyPublished(posts) {
  return posts.filter(post => normalizeStatus(post.status) === 'published');
}

export function buildIndex(posts) {
  const index = posts.map(post => ({
    id: post.id,
    slug: post.slug,
    title: post.title,
    date: post.date_iso,
    date_display: post.date_display,
    tags: post.tags || [],
    cover: post.cover,
    excerpt: post.excerpt
  }));
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`Successfully built blog/index.json with ${index.length} posts.`);
}

export function buildRss(posts) {
  const lastBuildDate = new Date().toUTCString();
  let xml = '<?xml version="1.0" encoding="UTF-8" ?>\n';
  xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n';
  xml += '  <channel>\n';
  xml += '    <title>Blog VagaLimitada</title>\n';
  xml += `    <link>${baseUrl}/pages/blog</link>\n`;
  xml += '    <description>Moldes, Costura, Crochê e Dicas Profissionais</description>\n';
  xml += `    <lastBuildDate>${lastBuildDate}</lastBuildDate>\n`;
  xml += `    <atom:link href="${baseUrl}/blog/rss.xml" rel="self" type="application/rss+xml" />\n`;

  for (const post of posts) {
    const postUrl = `${baseUrl}/pages/blogpost?slug=${post.slug}`;
    const pubDate = new Date(getPostDate(post)).toUTCString();
    xml += '    <item>\n';
    xml += `      <title>${post.title}</title>\n`;
    xml += `      <link>${postUrl}</link>\n`;
    xml += `      <guid>${postUrl}</guid>\n`;
    xml += `      <pubDate>${pubDate}</pubDate>\n`;
    xml += `      <description>${post.excerpt}</description>\n`;
    xml += '    </item>\n';
  }

  xml += '  </channel>\n';
  xml += '</rss>';
  fs.writeFileSync(RSS_FILE, xml, 'utf-8');
  console.log(`Successfully built blog/rss.xml with ${posts.length} items.`);
}

export function buildSitemap(posts) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  xml += '  <url>\n';
  xml += `    <loc>${baseUrl}/pages/blog</loc>\n`;
  if (posts.length > 0) {
    xml += `    <lastmod>${getPostDate(posts[0])}</lastmod>\n`;
  }
  xml += '    <changefreq>daily</changefreq>\n';
  xml += '    <priority>1.0</priority>\n';
  xml += '  </url>\n';

  for (const post of posts) {
    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}/pages/blogpost?slug=${post.slug}</loc>\n`;
    xml += `    <lastmod>${getPostDate(post)}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.8</priority>\n';
    xml += '  </url>\n';
  }

  xml += '</urlset>';
  fs.writeFileSync(SITEMAP_FILE, xml, 'utf-8');
  console.log(`Successfully built blog/sitemap.xml with ${posts.length + 1} URLs.`);
}

export function buildAll() {
  const posts = readPosts();
  const published = onlyPublished(posts);
  buildIndex(published);
  buildSitemap(published);
  buildRss(published);
  return published.length;
}

export function setPostStatus(slug, status) {
  if (!slug) throw new Error('Slug is required.');
  const postFile = path.join(POSTS_DIR, `${slug}.json`);
  if (!fs.existsSync(postFile)) {
    throw new Error(`Post not found: ${slug}`);
  }
  const post = JSON.parse(fs.readFileSync(postFile, 'utf8'));
  const nextStatus = normalizeStatus(status);
  post.status = nextStatus;
  fs.writeFileSync(postFile, JSON.stringify(post, null, 2));
}
