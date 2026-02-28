import fs from 'fs';
import path from 'path';

// This script should be run from the root of the public repo
const POSTS_DIR = path.resolve('blog/posts');

if (!fs.existsSync(POSTS_DIR)) {
    console.log("No posts directory found. Nothing to clean.");
    process.exit(0);
}

console.log("Starting Cleanup Process...");

const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.json'));
const postsBySlug = {};
let deletedCount = 0;

files.forEach(file => {
    const filePath = path.join(POSTS_DIR, file);
    
    // 1. Delete 'undefined-*' files immediately
    if (file.startsWith('undefined-')) {
        console.log(`Deleting invalid file: ${file}`);
        fs.unlinkSync(filePath);
        deletedCount++;
        return;
    }

    try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const slug = content.slug;
        const date = new Date(content.date_iso || 0);

        if (!slug) {
            console.warn(`File ${file} has no slug. Skipping.`);
            return;
        }

        if (!postsBySlug[slug]) {
            postsBySlug[slug] = [];
        }
        postsBySlug[slug].push({ file, date, path: filePath });

    } catch (e) {
        console.error(`Error parsing ${file}:`, e.message);
    }
});

// 2. Remove Duplicates (Keep newest)
Object.keys(postsBySlug).forEach(slug => {
    const entries = postsBySlug[slug];
    if (entries.length > 1) {
        // Sort by date descending (newest first)
        entries.sort((a, b) => b.date - a.date);
        
        // Keep index 0, delete the rest
        for (let i = 1; i < entries.length; i++) {
            console.log(`Deleting duplicate for slug '${slug}': ${entries[i].file}`);
            fs.unlinkSync(entries[i].path);
            deletedCount++;
        }
    }
});

console.log(`Cleanup complete. Deleted ${deletedCount} files.`);
