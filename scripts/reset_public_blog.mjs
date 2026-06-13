import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isConfirm = args.includes('--confirm');

if (!isDryRun && !isConfirm) {
  console.error('Error: Please specify either --dry-run or --confirm.');
  console.log('Usage:');
  console.log('  node scripts/reset_public_blog.mjs --dry-run');
  console.log('  node scripts/reset_public_blog.mjs --confirm');
  process.exit(1);
}

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_REPO_ROOT = path.resolve(__dirname, '..');

const BLOG_DIR = path.join(PUBLIC_REPO_ROOT, 'blog');
const POSTS_DIR = path.join(BLOG_DIR, 'posts');
const ASSETS_GEN_DIR = path.join(BLOG_DIR, 'assets', 'generated');

// Get list of posts
const posts = fs.existsSync(POSTS_DIR)
  ? fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.json'))
  : [];

// Get list of generated assets
function getFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getFilesRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

const assets = getFilesRecursive(ASSETS_GEN_DIR);

// Generate chronological timestamp
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
const isTest = args.includes('--test');
const backupPrefix = isTest ? 'test-backup-before-reset-' : 'backup-before-reset-';
const backupDirName = `${backupPrefix}${timestamp}`;
const backupPath = path.join(PUBLIC_REPO_ROOT, backupDirName);

if (isDryRun) {
  console.log('=== DRY RUN: RESET PUBLIC BLOG ===');
  console.log(`Backup Folder to be created: ${backupDirName}`);
  console.log(`Posts to be deleted: ${posts.length}`);
  if (posts.length > 0) {
    console.log('Preview of posts to be deleted (first 5):');
    posts.slice(0, 5).forEach(p => console.log(`  - blog/posts/${p}`));
  }
  console.log(`Generated assets to be deleted: ${assets.length}`);
  if (assets.length > 0) {
    console.log('Preview of assets to be deleted (first 5):');
    assets.slice(0, 5).map(f => path.relative(BLOG_DIR, f)).forEach(a => console.log(`  - blog/${a}`));
  }
  console.log('Files to be cleaned/regenerated:');
  console.log('  - blog/index.json (empty JSON array)');
  console.log('  - blog/state.json (empty initial state metadata)');
  console.log('  - blog/content_history.json (empty history structure)');
  console.log('  - blog/sitemap.xml (basic valid XML with home route)');
  console.log('  - blog/rss.xml (basic valid XML empty RSS channel)');
  console.log('\n[Dry-run completed. No files were changed.]');
  process.exit(0);
}

// Helper to recursively copy directories
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Helper to recursively delete contents of a directory (but keep the directory itself)
function deleteDirContents(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
  }
}

try {
  console.log('=== CONFIRMING PUBLIC BLOG RESET ===');
  console.log(`Creating backup directory at: ${backupPath}...`);
  fs.mkdirSync(backupPath, { recursive: true });
  
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Failed to create backup directory: ${backupPath}`);
  }

  // Backup files
  console.log('Backing up blog/posts...');
  if (fs.existsSync(POSTS_DIR)) {
    copyDirRecursive(POSTS_DIR, path.join(backupPath, 'blog', 'posts'));
  }

  console.log('Backing up blog/assets/generated...');
  if (fs.existsSync(ASSETS_GEN_DIR)) {
    copyDirRecursive(ASSETS_GEN_DIR, path.join(backupPath, 'blog', 'assets', 'generated'));
  }

  console.log('Backing up metadata and config files...');
  const metadataFiles = [
    'index.json',
    'sitemap.xml',
    'rss.xml',
    'state.json',
    'content_history.json',
    'product_intelligence.json',
    'config.json'
  ];

  fs.mkdirSync(path.join(backupPath, 'blog'), { recursive: true });
  for (const file of metadataFiles) {
    const srcFile = path.join(BLOG_DIR, file);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, path.join(backupPath, 'blog', file));
    }
  }

  // Verification step
  console.log('Verifying backup integrity...');
  const backedUpPosts = fs.existsSync(path.join(backupPath, 'blog', 'posts'))
    ? fs.readdirSync(path.join(backupPath, 'blog', 'posts')).filter(f => f.endsWith('.json'))
    : [];
  
  if (backedUpPosts.length !== posts.length) {
    throw new Error(`Backup verification failed: posts count mismatch (Source: ${posts.length}, Backup: ${backedUpPosts.length})`);
  }

  const backedUpAssets = getFilesRecursive(path.join(backupPath, 'blog', 'assets', 'generated'));
  if (backedUpAssets.length !== assets.length) {
    throw new Error(`Backup verification failed: assets count mismatch (Source: ${assets.length}, Backup: ${backedUpAssets.length})`);
  }

  for (const file of metadataFiles) {
    const backupFile = path.join(backupPath, 'blog', file);
    const srcFile = path.join(BLOG_DIR, file);
    if (fs.existsSync(srcFile)) {
      if (!fs.existsSync(backupFile)) {
        throw new Error(`Backup verification failed: ${file} is missing in backup.`);
      }
      if (fs.statSync(srcFile).size !== fs.statSync(backupFile).size) {
        throw new Error(`Backup verification failed: ${file} size mismatch.`);
      }
    }
  }

  console.log('✅ Backup verification successful! Proceeding with deletion...');

  // Safe Deletion
  console.log('Deleting old posts...');
  deleteDirContents(POSTS_DIR);

  console.log('Deleting old generated assets...');
  deleteDirContents(ASSETS_GEN_DIR);

  // Regeneration of clean files
  console.log('Regenerating clean metadata files...');

  // 1. blog/index.json
  fs.writeFileSync(path.join(BLOG_DIR, 'index.json'), '[]', 'utf8');

  // 2. blog/state.json
  const emptyState = {
    published_slugs: [],
    published_keywords: {},
    published_by_product: {},
    last_published_at: "",
    published_count: 0,
    history: [],
    wp_posts: {}
  };
  fs.writeFileSync(path.join(BLOG_DIR, 'state.json'), JSON.stringify(emptyState, null, 2), 'utf8');

  // 3. blog/content_history.json
  const emptyContentHistory = {
    by_product_id: {}
  };
  fs.writeFileSync(path.join(BLOG_DIR, 'content_history.json'), JSON.stringify(emptyContentHistory, null, 2), 'utf8');

  // 4. blog/sitemap.xml
  const basicSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://pay.vagalimitada.com/pages/blog</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
  fs.writeFileSync(path.join(BLOG_DIR, 'sitemap.xml'), basicSitemap, 'utf8');

  // 5. blog/rss.xml
  const basicRss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Blog VagaLimitada</title>
    <link>https://pay.vagalimitada.com/pages/blog</link>
    <description>Moldes, Costura, Crochê e Dicas Profissionais</description>
    <language>pt-BR</language>
    <atom:link href="https://pay.vagalimitada.com/blog/rss.xml" rel="self" type="application/rss+xml" />
  </channel>
</rss>`;
  fs.writeFileSync(path.join(BLOG_DIR, 'rss.xml'), basicRss, 'utf8');

  console.log('🎉 Reset and clean initialization completed successfully!');
  console.log(`Backup preserved at: ${backupPath}`);
  process.exit(0);

} catch (error) {
  console.error('❌ Error during reset process:', error.message);
  process.exit(1);
}
