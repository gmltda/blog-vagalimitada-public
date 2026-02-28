import fs from 'fs';
import path from 'path';

const postsDir = 'blog/posts';
const sitemapFile = 'blog/sitemap.xml';
const baseUrl = 'https://pay.vagalimitada.com';

function buildSitemap() {
  const files = fs.readdirSync(postsDir).filter(file => file.endsWith('.json'));
  const posts = files.map(file => {
    const filePath = path.join(postsDir, file);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  });

  // Sort by date desc
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Home/Blog index
  xml += '  <url>\n';
  xml += `    <loc>${baseUrl}/pages/blog</loc>\n`;
  if (posts.length > 0) {
    xml += `    <lastmod>${posts[0].date}</lastmod>\n`;
  }
  xml += '    <changefreq>daily</changefreq>\n';
  xml += '    <priority>1.0</priority>\n';
  xml += '  </url>\n';

  // Individual posts
  for (const post of posts) {
    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}/pages/blogpost?slug=${post.slug}</loc>\n`;
    xml += `    <lastmod>${post.date}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.8</priority>\n';
    xml += '  </url>\n';
  }

  xml += '</urlset>';

  fs.writeFileSync(sitemapFile, xml, 'utf-8');
  console.log(`Successfully built ${sitemapFile} with ${posts.length + 1} URLs.`);
}

buildSitemap();
