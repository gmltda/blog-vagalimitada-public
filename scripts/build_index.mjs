import fs from 'fs';
import path from 'path';
import { buildAll } from './blog_builder.mjs';

const BLOG_DIR = path.resolve('blog');

// --- RUN CLEANUP FIRST ---
try {
    const cleanupScript = path.join(BLOG_DIR, '../scripts/cleanup_public.mjs');
    if (fs.existsSync(cleanupScript)) {
        console.log("Running cleanup...");
        const { execSync } = await import('child_process');
        execSync(`node "${cleanupScript}"`, { stdio: 'inherit' });
    }
} catch (e) {
    console.error("Cleanup failed:", e.message);
}

console.log('Building Blog Index, Sitemap and RSS...');
buildAll();
