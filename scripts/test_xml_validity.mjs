import fs from 'fs';
import path from 'path';

const SITEMAP_FILE = path.resolve('blog/sitemap.xml');
const RSS_FILE = path.resolve('blog/rss.xml');

function validateXmlFile(filePath) {
  console.log(`Validating XML File: ${path.basename(filePath)}...`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Strip CDATA to ignore raw ampersands inside CDATA blocks (valid in XML)
  const cleanContentForAmpCheck = content.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

  // 1. Check for unescaped ampersands: & followed by anything that is not a valid entity
  const rawAmpRegex = /&(?!([a-zA-Z0-9]+|#\d+|#x[a-fA-F0-9]+);)/g;
  const rawAmps = [];
  
  // Find all matches with line numbers
  const lines = cleanContentForAmpCheck.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let ampMatch;
    while ((ampMatch = rawAmpRegex.exec(line)) !== null) {
      rawAmps.push({ lineNum: i + 1, index: ampMatch.index, context: line.substring(Math.max(0, ampMatch.index - 20), ampMatch.index + 20) });
    }
  }

  if (rawAmps.length > 0) {
    console.error(`❌ FAIL: Found ${rawAmps.length} unescaped '&' characters in ${path.basename(filePath)}:`);
    rawAmps.slice(0, 10).forEach(amp => {
      console.error(`   Line ${amp.lineNum}: ...${amp.context.trim()}...`);
    });
    throw new Error(`XML Validation Failed: Unescaped ampersand characters found.`);
  }
  console.log("✅ PASS: No unescaped ampersands found.");

  // 2. Validate tag balancing (structural check)
  try {
    checkXmlStructure(content);
    console.log("✅ PASS: XML structure (tag balancing) is correct.");
  } catch (err) {
    console.error(`❌ FAIL: XML structure validation failed: ${err.message}`);
    throw err;
  }
}

function checkXmlStructure(xmlString) {
  const stack = [];
  // Regular expression to match tag structure
  const tagRegex = /<(\/?)(?::|[a-zA-Z_])[-a-zA-Z0-9_.:]*(?:\s+[^>]*?)?(\/?)>/g;
  let match;
  
  // Strip CDATA to avoid parsing HTML tags inside CDATA blocks
  const cleanXml = xmlString.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  
  // Strip comments
  const noComments = cleanXml.replace(/<!--[\s\S]*?-->/g, '');

  // Strip XML declaration
  const body = noComments.replace(/^<\?xml[^>]*\?>/i, '');

  while ((match = tagRegex.exec(body)) !== null) {
    const isClosing = match[1] === '/';
    const isSelfClosing = match[2] === '/';
    const tagFull = match[0];
    const tagName = tagFull.match(/<(?:\/)?([a-zA-Z0-9_.:]+)/)[1];

    if (isSelfClosing) {
      continue;
    }

    if (isClosing) {
      if (stack.length === 0) {
        throw new Error(`Unexpected closing tag </${tagName}> without opening tag.`);
      }
      const lastOpen = stack.pop();
      if (lastOpen !== tagName) {
        throw new Error(`Mismatched tags: opened <${lastOpen}> but closed </${tagName}>.`);
      }
    } else {
      stack.push(tagName);
    }
  }

  if (stack.length > 0) {
    throw new Error(`Unclosed tags remaining: ${stack.join(', ')}`);
  }
}

try {
  validateXmlFile(SITEMAP_FILE);
  console.log("");
  validateXmlFile(RSS_FILE);
  console.log("\n🎉 ALL XML VALIDITY TESTS PASSED 100%");
  process.exit(0);
} catch (e) {
  console.error("\n❌ XML VALIDITY TESTS FAILED:", e.message);
  process.exit(1);
}
