import fs from 'fs';
import path from 'path';

const BLOG_DIR = path.resolve('blog');
const POSTS_DIR = path.join(BLOG_DIR, 'posts');
const INDEX_FILE = path.join(BLOG_DIR, 'index.json');
const RSS_FILE = path.join(BLOG_DIR, 'rss.xml');
const SITEMAP_FILE = path.join(BLOG_DIR, 'sitemap.xml');
const baseUrl = 'https://pay.vagalimitada.com';

function ensureDirs() {
  if (!fs.existsSync(POSTS_DIR)) {
    fs.mkdirSync(POSTS_DIR, { recursive: true });
  }
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
