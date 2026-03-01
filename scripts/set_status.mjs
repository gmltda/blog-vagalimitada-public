import { execSync } from 'child_process';
import { buildAll, setPostStatus } from './blog_builder.mjs';

const slug = process.argv[2];
const status = process.argv[3];

if (!slug || !status) {
  console.error('Usage: node scripts/set_status.mjs <slug> <status>');
  process.exit(1);
}

setPostStatus(slug, status);
buildAll();

execSync('git add blog/posts blog/index.json blog/rss.xml blog/sitemap.xml', { stdio: 'inherit' });
const staged = execSync('git diff --staged --porcelain').toString().trim();
if (!staged) {
  console.log('No changes to commit.');
  process.exit(0);
}
execSync(`git commit -m "chore(blog): set ${slug} status to ${status}"`, { stdio: 'inherit' });
execSync('git push', { stdio: 'inherit' });
