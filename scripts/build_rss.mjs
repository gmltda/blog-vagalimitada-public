import fs from 'fs';
import path from 'path';

const postsDir = 'blog/posts';
const rssFile = 'blog/rss.xml';
const baseUrl = 'https://pay.vagalimitada.com';

function buildRSS() {
  const files = fs.readdirSync(postsDir).filter(file => file.endsWith('.json'));
  const posts = files.map(file => {
    const filePath = path.join(postsDir, file);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  });

  // Sort by date desc
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

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
    const pubDate = new Date(post.date).toUTCString();

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

  fs.writeFileSync(rssFile, xml, 'utf-8');
  console.log(`Successfully built ${rssFile} with ${posts.length} items.`);
}

buildRSS();
