import fs from 'fs';
import path from 'path';

// Define paths relative to the script location
// Assuming this script runs from the repo root or scripts/ folder
const BLOG_DIR = path.resolve('blog');
const POSTS_DIR = path.join(BLOG_DIR, 'posts');
const INDEX_FILE = path.join(BLOG_DIR, 'index.json');

// Ensure directories exist
if (!fs.existsSync(POSTS_DIR)) {
  fs.mkdirSync(POSTS_DIR, { recursive: true });
}

console.log('Building Blog Index...');

const posts = [];
const files = fs.readdirSync(POSTS_DIR);

files.forEach(file => {
  if (path.extname(file) === '.json') {
    const filePath = path.join(POSTS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const post = JSON.parse(content);
      
      let modified = false;

      // --- MIGRATION & SANITIZATION LOGIC ---
      
      // 1. Validate Slug vs Filename
      const filenameBase = path.basename(file, '.json');
      if (post.slug !== filenameBase) {
        console.warn(`[FIX] Slug mismatch in ${file}. Updating slug to '${filenameBase}'.`);
        post.slug = filenameBase;
        modified = true;
      }
      
      // 2. Migrate Image -> Cover
      if (post.image && !post.cover) {
          post.cover = post.image;
          modified = true;
      }
      
      // 3. Migrate Content -> Content_HTML
      if (post.content && !post.content_html) {
          post.content_html = post.content;
          modified = true;
      }

      // 4. Ensure Date ISO
      if (!post.date_iso) {
          if (post.date) {
              // Assume existing date is YYYY-MM-DD, add default time
              post.date_iso = `${post.date}T12:00:00-03:00`;
          } else {
              post.date_iso = new Date().toISOString();
          }
          modified = true;
      }

      // 5. Ensure Date Display
      if (!post.date_display) {
          try {
              const d = new Date(post.date_iso);
              const day = String(d.getDate()).padStart(2, '0');
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const year = d.getFullYear();
              const hours = String(d.getHours()).padStart(2, '0');
              const minutes = String(d.getMinutes()).padStart(2, '0');
              post.date_display = `${day}/${month}/${year} às ${hours}:${minutes}`;
          } catch(e) {
              post.date_display = post.date || "Data desconhecida";
          }
          modified = true;
      }

      // 6. Ensure ID
      if (!post.id) {
          post.id = post.slug;
          modified = true;
      }

      // Save back if modified
      if (modified) {
          fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
          console.log(`[UPDATED] Migrated schema for ${file}`);
      }
      
      // --- INDEX ENTRY CREATION ---
      // Only add to index if valid
      if (post.slug && post.title) {
        posts.push({
            id: post.id,
            slug: post.slug,
            title: post.title,
            date: post.date_iso, // Use ISO for sorting
            date_display: post.date_display,
            tags: post.tags || [],
            cover: post.cover,
            excerpt: post.excerpt
        });
      } else {
          console.warn(`[SKIP] Invalid post skipped: ${file}`);
      }

    } catch (error) {
      console.error(`Error processing file ${file}:`, error.message);
    }
  }
});

// Sort by date descending (newest first)
posts.sort((a, b) => new Date(b.date) - new Date(a.date));

fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
console.log(`Successfully built blog/index.json with ${posts.length} posts.`);
