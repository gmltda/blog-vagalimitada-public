import { execSync } from 'child_process';
import { buildAll, setPostStatus } from './blog_builder.mjs';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/delete_post.mjs <slug>');
  process.exit(1);
}

setPostStatus(slug, 'archived');
buildAll();

execSync('git add blog/posts blog/assets blog/index.json blog/rss.xml blog/sitemap.xml', { stdio: 'inherit' });
const status = execSync('git diff --staged --porcelain').toString().trim();
if (!status) {
  console.log('No changes to commit.');
  process.exit(0);
}
execSync(`git commit -m "chore(blog): set ${slug} status to archived"`, { stdio: 'inherit' });
execSync('git push', { stdio: 'inherit' });
