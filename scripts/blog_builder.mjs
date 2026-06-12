import fs from 'fs';
import path from 'path';

const BLOG_DIR = path.resolve('blog');
const POSTS_DIR = path.join(BLOG_DIR, 'posts');
const INDEX_FILE = path.join(BLOG_DIR, 'index.json');
const CONFIG_FILE = path.join(BLOG_DIR, 'config.json');
const RSS_FILE = path.join(BLOG_DIR, 'rss.xml');
const SITEMAP_FILE = path.join(BLOG_DIR, 'sitemap.xml');
const baseUrl = 'https://pay.vagalimitada.com';
const canonicalOrigin = 'https://vagalimitada.com'; // O blog principal (WordPress)
const BLOG_ASSETS_ORIGIN = 'https://cdn.jsdelivr.net/gh/gmltda/blog-vagalimitada-public@main';

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

function buildFallbackSearchUrl(term, slug, shopeeItems) {
  const keyword = String(term || '');
  const reference = shopeeItems.find(item => isValidHttpUrl(item.search_url));
  if (reference && reference.search_url) {
    try {
      const url = new URL(reference.search_url);
      url.searchParams.set('keyword', keyword);
      if (slug) url.searchParams.set('utm_content', slug);
      url.searchParams.set('utm_term', keyword);
      return url.toString();
    } catch {}
  }
  const encoded = encodeURIComponent(keyword);
  return `https://shopee.com.br/search?keyword=${encoded}`;
}

function ensureUlClass(ulHtml, className) {
  if (/class=["'][^"']*materials-ul[^"']*["']/i.test(ulHtml)) return ulHtml;
  if (/class=["'][^"']*["']/i.test(ulHtml)) {
    return ulHtml.replace(/class=["']([^"']*)["']/, (match, classes) => `class="${classes} ${className}"`);
  }
  return ulHtml.replace('<ul', `<ul class="${className}"`);
}

function enrichMaterialsUlWithThumbs(html, shopeeItems, slug) {
  const source = String(html || '');
  if (!source) return source;
  const headingRegex = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRegex.exec(source)) !== null) {
    const headingText = normalizeText(match[2] || '');
    if (!(headingText.includes('materiais recomendados') || headingText.includes('materiais para comecar'))) {
      continue;
    }
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
      // Se não houver imagem real do Shopee, NÃO injetar placeholder cinza (fica feio no WP e no blog).
      // Deixar sem thumbnail quando não há match — o CSS cuida de layout com/sem thumb via classe has-thumb/no-thumb.
      const imageUrl = candidate?.image_url ? absolutizeAssetUrl(candidate.image_url) : null;
      const offerUrl = candidate?.offer_url && isValidHttpUrl(candidate.offer_url) ? candidate.offer_url : null;
      const searchUrl = candidate?.search_url && isValidHttpUrl(candidate.search_url)
        ? candidate.search_url
        : buildFallbackSearchUrl(nameLabel, slug, shopeeItems);
      const linkUrl = offerUrl || searchUrl;
      const hasLink = /<a\s/i.test(li);
      const hasImage = Boolean(candidate?.image_url);
      let updatedLi = li;
      if (hasLink && offerUrl) {
        updatedLi = updatedLi.replace(/href=["'][^"']*["']/, `href="${offerUrl}"`);
      }
      if (hasLink && !offerUrl && linkUrl) {
        updatedLi = updatedLi.replace(/href=["'][^"']*["']/, `href="${linkUrl}"`);
      }
      if (!hasLink && linkUrl) {
        updatedLi = updatedLi.replace(/<\/li>/i, `<br><a href="${linkUrl}" target="_blank" rel="nofollow noopener">Ver produto recomendado</a></li>`);
      }
      if (!hasBody) {
        updatedLi = updatedLi.replace(/<li([^>]*)>/i, (match, attrs) => {
          if (/class=["'][^"']*["']/.test(attrs)) {
            const classes = hasImage ? 'material-li has-thumb' : 'material-li no-thumb';
            return `<li${attrs.replace(/class=["']([^"']*)["']/, (m, cls) => ` class="${cls} ${classes}"`)}>`;
          }
          return `<li${attrs} class="${hasImage ? 'material-li has-thumb' : 'material-li no-thumb'}">`;
        });
        updatedLi = updatedLi.replace(/<li[^>]*>([\s\S]*?)<\/li>/i, (matchAll, inner) => {
          const body = `<div class="material-body">${inner}</div>`;
          const liClass = hasImage ? 'material-li has-thumb' : 'material-li no-thumb';
          if (hasThumb) return `<li class="${liClass}">${body}</li>`;
          // Só injeta thumbnail quando houver imagem real; sem imagem, apenas o corpo (no-thumb).
          const thumb = imageUrl
            ? `<img class="material-thumb" src="${imageUrl}" alt="${nameLabel || 'Material'}" loading="lazy" onerror="this.remove()">`
            : '';
          return `<li class="${liClass}">${thumb}${body}</li>`;
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

function applyTemplateVariant(html, template) {
  const content = String(html || '');
  if (!template || !content) return content;
  const marker = `data-template-block="${template}"`;
  if (content.includes(marker)) return content;
  const blockMap = {
    guide: `<h2 data-template-block="guide">Passo a Passo Resumido</h2><ol><li>Separe os materiais principais.</li><li>Teste uma pequena amostra antes de iniciar.</li><li>Finalize com acabamento simples.</li></ol>`,
    checklist: `<h2 data-template-block="checklist">Checklist Rápido</h2><ul><li>Materiais separados</li><li>Ferramentas à mão</li><li>Tempo reservado</li></ul>`,
    mistakes: `<h2 data-template-block="mistakes">Erros Comuns</h2><ul><li>Ignorar a tensão do fio</li><li>Medidas sem conferência</li><li>Escolha de material inadequada</li></ul>`,
    comparison: `<h2 data-template-block="comparison">Comparativo Rápido</h2><ul><li>Opção A: mais simples</li><li>Opção B: mais resistente</li><li>Opção C: acabamento premium</li></ul>`,
    ideas: `<h2 data-template-block="ideas">Ideias para Variar</h2><ul><li>Troque a paleta de cores</li><li>Combine texturas</li><li>Adapte o tamanho</li></ul>`
  };
  const block = blockMap[template];
  if (!block) return content;
  return `${content}\n${block}`;
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
        const withAssets = rewriteHtmlAssets(post.content_html);
        const templated = applyTemplateVariant(withAssets, post.template);
        if (templated !== post.content_html) {
          post.content_html = templated;
          modified = true;
        }
      }

      if (!post.date_iso) {
        post.date_iso = post.date ? `${post.date}T12:00:00-03:00` : new Date().toISOString();
        modified = true;
      }

      if (!post.date_display) {
        try {
          const d = new Date(post.date_iso);
          post.date_display = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        } catch {
          post.date_display = post.date || "Recente";
        }
        modified = true;
      }

      if (!post.id) { post.id = post.slug; modified = true; }
      if (post.cover && !post.cover_absolute) { post.cover_absolute = absolutizeAssetUrl(post.cover); modified = true; }
      
      if (!post.canonical_url && post.slug) {
        post.canonical_url = `${baseUrl}/pages/blogpost?slug=${post.slug}`;
        modified = true;
      }

      const normalizedStatus = normalizeStatus(post.status);
      if (post.status !== normalizedStatus) { post.status = normalizedStatus; modified = true; }

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
  const index = posts.map(post => {
    const coverAbsolute = post.cover_absolute || (post.cover ? absolutizeAssetUrl(post.cover) : '');
    const canonicalUrl = post.canonical_url || `${baseUrl}/pages/blogpost?slug=${post.slug}`;
    const cartpandaUrl = post.cartpanda_url || `${baseUrl}/pages/blogpost?slug=${post.slug}`;
    const displayUrl = post.display_url || `${baseUrl}/pages/blogpost?slug=${post.slug}`;
    const wordpressUrl = post.wordpress_url || (canonicalUrl.includes('vagalimitada.com') && !canonicalUrl.includes('pay.vagalimitada.com') ? canonicalUrl : null);
    
    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      date: post.date_iso,
      updated_at: post.updated_at || post.date_iso, // #11
      date_display: post.date_display,
      tags: post.tags || [],
      cover: post.cover,
      cover_absolute: coverAbsolute,
      canonical_url: canonicalUrl,
      wordpress_url: wordpressUrl,
      cartpanda_url: cartpandaUrl,
      display_url: displayUrl,
      reading_time_min: post.reading_time_min || null, // #33
      excerpt: post.excerpt,
      // #12, #18 — pass-through OG meta for the frontend head renderer.
      // Twitter Cards removidos: não há conta Twitter/X ativa.
      og: post.og || null
    };
  });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`Successfully built blog/index.json with ${index.length} posts.`);
}

export function buildConfig() {
  const config = {
    canonical_origin: canonicalOrigin,
    assets_origin: BLOG_ASSETS_ORIGIN,
    base_url: baseUrl,
    last_updated: new Date().toISOString()
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`Successfully built blog/config.json.`);
}

function xmlEscape(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatIsoDate(dateVal) {
  if (!dateVal) return new Date().toISOString();
  try {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {}
  return xmlEscape(String(dateVal).trim());
}

// #10 RSS with content:encoded + enclosure for cover image.
export function buildRss(posts) {
  const lastBuildDate = new Date().toUTCString();
  let xml = '<?xml version="1.0" encoding="UTF-8" ?>\n';
  xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">\n';
  xml += '  <channel>\n';
  xml += '    <title>Blog VagaLimitada</title>\n';
  xml += `    <link>${xmlEscape(baseUrl + '/pages/blog')}</link>\n`;
  xml += '    <description>Moldes, Costura, Crochê e Dicas Profissionais</description>\n';
  xml += '    <language>pt-BR</language>\n';
  xml += `    <lastBuildDate>${xmlEscape(lastBuildDate)}</lastBuildDate>\n`;
  xml += `    <atom:link href="${xmlEscape(baseUrl + '/blog/rss.xml')}" rel="self" type="application/rss+xml" />\n`;

  for (const post of posts) {
    const postUrl = `${baseUrl}/pages/blogpost?slug=${post.slug}`;
    const pubDate = new Date(getPostDate(post)).toUTCString();
    const coverAbs = post.cover_absolute || (post.cover ? absolutizeAssetUrl(post.cover) : '');
    const fullHtml = rewriteHtmlAssets(post.content_html || '');
    const safeHtml = fullHtml.replace(/\]\]>/g, ']]&gt;');
    
    xml += '    <item>\n';
    xml += `      <title>${xmlEscape(post.title)}</title>\n`;
    xml += `      <link>${xmlEscape(postUrl)}</link>\n`;
    xml += `      <guid isPermaLink="true">${xmlEscape(postUrl)}</guid>\n`;
    xml += `      <pubDate>${xmlEscape(pubDate)}</pubDate>\n`;
    xml += `      <dc:creator>${xmlEscape(post.author || 'Equipe Vaga Limitada')}</dc:creator>\n`;
    xml += `      <description>${xmlEscape(post.excerpt || '')}</description>\n`;
    if (safeHtml) {
      xml += `      <content:encoded><![CDATA[${safeHtml}]]></content:encoded>\n`;
    }
    (post.tags || []).forEach(t => {
      xml += `      <category>${xmlEscape(t)}</category>\n`;
    });
    if (coverAbs) {
      const mime = coverAbs.endsWith('.webp') ? 'image/webp' : (coverAbs.endsWith('.png') ? 'image/png' : 'image/jpeg');
      xml += `      <enclosure url="${xmlEscape(coverAbs)}" type="${xmlEscape(mime)}" length="0" />\n`;
    }
    xml += '    </item>\n';
  }

  xml += '  </channel>\n';
  xml += '</rss>';
  fs.writeFileSync(RSS_FILE, xml, 'utf-8');
  console.log(`Successfully built blog/rss.xml with ${posts.length} items.`);
}

// #9 Sitemap with image:image extension and updated_at precedence.
export function buildSitemap(posts) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';
  xml += '  <url>\n';
  xml += `    <loc>${xmlEscape(baseUrl + '/pages/blog')}</loc>\n`;
  if (posts.length > 0) {
    const rawDate = posts[0].updated_at || getPostDate(posts[0]);
    xml += `    <lastmod>${formatIsoDate(rawDate)}</lastmod>\n`;
  }
  xml += '    <changefreq>daily</changefreq>\n';
  xml += '    <priority>1.0</priority>\n';
  xml += '  </url>\n';

  for (const post of posts) {
    const coverAbs = post.cover_absolute || (post.cover ? absolutizeAssetUrl(post.cover) : '');
    const postUrl = `${baseUrl}/pages/blogpost?slug=${post.slug}`;
    const rawDate = post.updated_at || getPostDate(post);
    xml += '  <url>\n';
    xml += `    <loc>${xmlEscape(postUrl)}</loc>\n`;
    xml += `    <lastmod>${formatIsoDate(rawDate)}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.8</priority>\n';
    if (coverAbs) {
      xml += '    <image:image>\n';
      xml += `      <image:loc>${xmlEscape(coverAbs)}</image:loc>\n`;
      xml += `      <image:title>${xmlEscape(post.title)}</image:title>\n`;
      if (post.excerpt) xml += `      <image:caption>${xmlEscape(post.excerpt)}</image:caption>\n`;
      xml += '    </image:image>\n';
    }
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
  buildConfig();
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
