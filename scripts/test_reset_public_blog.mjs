import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { execSync } from 'child_process';

const PUBLIC_REPO_DIR = path.resolve('.');
const BLOG_DIR = path.join(PUBLIC_REPO_DIR, 'blog');
const TEMP_BACKUP_DIR = path.join(PUBLIC_REPO_DIR, 'blog_temp_backup');

console.log('=== RUNNING SAFE RESET PUBLIC BLOG TESTS ===');

// Helper to clean up backup folders created by tests
function cleanTestBackups() {
  const dirs = fs.readdirSync(PUBLIC_REPO_DIR);
  for (const dir of dirs) {
    if (dir.startsWith('test-backup-before-reset-')) {
      const fullPath = path.join(PUBLIC_REPO_DIR, dir);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }
}

// Ensure original blog directory is restored on exit/failure
function restoreOriginalBlog() {
  if (fs.existsSync(TEMP_BACKUP_DIR)) {
    console.log('Restoring original blog folder from temp backup...');
    fs.rmSync(BLOG_DIR, { recursive: true, force: true });
    fs.renameSync(TEMP_BACKUP_DIR, BLOG_DIR);
    console.log('Original blog folder restored.');
  }
}

try {
  // 1. Move original blog directory to a safe temporary location
  if (fs.existsSync(BLOG_DIR)) {
    console.log('Moving original blog folder to temp backup...');
    fs.renameSync(BLOG_DIR, TEMP_BACKUP_DIR);
  }

  // 2. Setup Mock Blog directory
  console.log('Setting up mock blog directory for testing...');
  fs.mkdirSync(BLOG_DIR, { recursive: true });
  fs.mkdirSync(path.join(BLOG_DIR, 'posts'), { recursive: true });
  fs.mkdirSync(path.join(BLOG_DIR, 'assets', 'generated'), { recursive: true });

  fs.writeFileSync(path.join(BLOG_DIR, 'posts', 'post1.json'), '{"id":"post1","title":"Post 1"}', 'utf8');
  fs.writeFileSync(path.join(BLOG_DIR, 'posts', 'post2.json'), '{"id":"post2","title":"Post 2"}', 'utf8');
  fs.writeFileSync(path.join(BLOG_DIR, 'assets', 'generated', 'img1.webp'), 'fake-image-bytes', 'utf8');
  fs.writeFileSync(path.join(BLOG_DIR, 'index.json'), '[{"slug":"post1"},{"slug":"post2"}]', 'utf8');
  fs.writeFileSync(path.join(BLOG_DIR, 'state.json'), '{"published_slugs":["post1","post2"]}', 'utf8');
  fs.writeFileSync(path.join(BLOG_DIR, 'content_history.json'), '{"by_product_id":{"123":[]}}', 'utf8');
  fs.writeFileSync(path.join(BLOG_DIR, 'product_intelligence.json'), '{"intel_cache":{}}', 'utf8');
  fs.writeFileSync(path.join(BLOG_DIR, 'config.json'), '{"origin":""}', 'utf8');
  fs.writeFileSync(path.join(BLOG_DIR, 'sitemap.xml'), '<urlset></urlset>', 'utf8');
  fs.writeFileSync(path.join(BLOG_DIR, 'rss.xml'), '<rss></rss>', 'utf8');

  // 3. Test: Dry-run Mode
  console.log('Testing dry-run mode...');
  const dryRunOutput = execSync('node scripts/reset_public_blog.mjs --dry-run --test', { encoding: 'utf8' });
  
  assert(dryRunOutput.includes('=== DRY RUN: RESET PUBLIC BLOG ==='), 'Dry-run output missing header');
  assert(dryRunOutput.includes('Posts to be deleted: 2'), 'Dry-run post count mismatch');
  assert(dryRunOutput.includes('Generated assets to be deleted: 1'), 'Dry-run asset count mismatch');

  // Ensure files were NOT deleted during dry-run
  assert(fs.existsSync(path.join(BLOG_DIR, 'posts', 'post1.json')), 'Dry-run deleted post1.json');
  assert(fs.existsSync(path.join(BLOG_DIR, 'posts', 'post2.json')), 'Dry-run deleted post2.json');
  assert(fs.existsSync(path.join(BLOG_DIR, 'assets', 'generated', 'img1.webp')), 'Dry-run deleted img1.webp');

  console.log('✅ PASS: Dry-run mode did not modify any files.');

  // 4. Test: Confirm Mode
  console.log('Testing confirm mode...');
  const confirmOutput = execSync('node scripts/reset_public_blog.mjs --confirm --test', { encoding: 'utf8' });
  
  assert(confirmOutput.includes('=== CONFIRMING PUBLIC BLOG RESET ==='), 'Confirm output missing header');
  assert(confirmOutput.includes('Backup verification successful!'), 'Confirm output missing verification success');

  // Parse backup directory path from confirm mode stdout
  const match = confirmOutput.match(/Backup preserved at:\s*(.*)/i);
  assert(match && match[1], 'Could not parse backup path from stdout');
  const backupPath = match[1].trim();

  // Verify backup contents
  assert(fs.existsSync(path.join(backupPath, 'blog', 'posts', 'post1.json')), 'post1.json missing in backup');
  assert(fs.existsSync(path.join(backupPath, 'blog', 'posts', 'post2.json')), 'post2.json missing in backup');
  assert(fs.existsSync(path.join(backupPath, 'blog', 'assets', 'generated', 'img1.webp')), 'img1.webp missing in backup');
  assert(fs.readFileSync(path.join(backupPath, 'blog', 'config.json'), 'utf8') === '{"origin":""}', 'config.json corrupted in backup');
  assert(fs.readFileSync(path.join(backupPath, 'blog', 'product_intelligence.json'), 'utf8') === '{"intel_cache":{}}', 'product_intelligence.json corrupted in backup');

  console.log('✅ PASS: Backup contains all files and verified correctly.');

  // Verify deletion
  const postFiles = fs.readdirSync(path.join(BLOG_DIR, 'posts'));
  assert.strictEqual(postFiles.length, 0, 'Posts directory not empty after reset');

  const assetFiles = fs.readdirSync(path.join(BLOG_DIR, 'assets', 'generated'));
  assert.strictEqual(assetFiles.length, 0, 'Generated assets directory not empty after reset');

  console.log('✅ PASS: Posts and generated assets deleted.');

  // Verify preservation
  assert(fs.existsSync(path.join(BLOG_DIR, 'config.json')), 'config.json deleted');
  assert(fs.existsSync(path.join(BLOG_DIR, 'product_intelligence.json')), 'product_intelligence.json deleted');
  assert(fs.readFileSync(path.join(BLOG_DIR, 'config.json'), 'utf8') === '{"origin":""}', 'config.json modified');
  assert(fs.readFileSync(path.join(BLOG_DIR, 'product_intelligence.json'), 'utf8') === '{"intel_cache":{}}', 'product_intelligence.json modified');

  console.log('✅ PASS: Config and intelligence cache preserved.');

  // Verify empty/clean files regeneration
  const indexJson = JSON.parse(fs.readFileSync(path.join(BLOG_DIR, 'index.json'), 'utf8'));
  assert(Array.isArray(indexJson) && indexJson.length === 0, 'index.json is not an empty array');

  const stateJson = JSON.parse(fs.readFileSync(path.join(BLOG_DIR, 'state.json'), 'utf8'));
  assert.strictEqual(stateJson.published_slugs.length, 0, 'state.json published_slugs not empty');
  assert.strictEqual(stateJson.published_count, 0, 'state.json published_count not 0');

  const contentHistoryJson = JSON.parse(fs.readFileSync(path.join(BLOG_DIR, 'content_history.json'), 'utf8'));
  assert.deepStrictEqual(contentHistoryJson.by_product_id, {}, 'content_history.json by_product_id not empty');

  // Verify valid XML structure
  const sitemapXml = fs.readFileSync(path.join(BLOG_DIR, 'sitemap.xml'), 'utf8');
  assert(sitemapXml.includes('<urlset'), 'sitemap.xml invalid structure');
  assert(sitemapXml.includes('https://pay.vagalimitada.com/pages/blog'), 'sitemap.xml missing home route');

  const rssXml = fs.readFileSync(path.join(BLOG_DIR, 'rss.xml'), 'utf8');
  assert(rssXml.includes('<rss'), 'rss.xml invalid structure');
  assert(rssXml.includes('<channel>'), 'rss.xml missing channel tag');

  console.log('✅ PASS: Empty metadata files correctly regenerated.');

  console.log('\n🎉 ALL SAFE RESET TESTS PASSED successfully!');
  
  // Cleanup test backup folders
  cleanTestBackups();
  restoreOriginalBlog();
  process.exit(0);

} catch (error) {
  console.error('\n❌ TEST SUITE FAILED:', error.stack);
  cleanTestBackups();
  restoreOriginalBlog();
  process.exit(1);
}
