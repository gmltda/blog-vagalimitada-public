import fs from 'fs';
import path from 'path';

// Argumentos da linha de comando
const args = process.argv.slice(2);
const TARGET_DIR = args[0] || 'blog'; // Default para 'blog' se nenhum argumento for passado

// Diretórios e arquivos para ignorar completamente (mesmo que estejam dentro do target, o que é improvável para .git/node_modules, mas bom prevenir)
const IGNORE_DIRS = [
  '.git',
  'node_modules',
  '.github',
  'scripts',
  'temp_public_repo'
];

// Arquivos proibidos (extensão ou nome exato)
const FORBIDDEN_EXTENSIONS = ['.env', '.liquid'];

// Padrões de conteúdo proibido (segredos)
const FORBIDDEN_CONTENT_PATTERNS = [
  'Authorization:',
  'Bearer ',
  'api_key',
  'secret',
  'token=',
  'x-api-key',
  'client_secret'
];

// Extensões permitidas para scan de conteúdo (text files onde segredos podem estar)
const TEXT_EXTENSIONS = ['.json', '.xml', '.txt', '.md', '.html', '.js', '.mjs', '.css'];

function isIgnored(fullPath) {
  const parts = fullPath.split(path.sep);
  return parts.some(part => IGNORE_DIRS.includes(part));
}

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Directory ${dir} does not exist. Skipping scan.`);
    return;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Ignora diretórios/arquivos da lista de exclusão
    if (isIgnored(fullPath)) continue;

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
      continue;
    }

    // 1. Validação de nome de arquivo (proibidos)
    if (FORBIDDEN_EXTENSIONS.some(ext => entry.name.endsWith(ext) || entry.name === ext)) {
      throw new Error(`Forbidden file type found: ${fullPath}`);
    }

    // 2. Scan de conteúdo apenas em arquivos de texto
    const ext = path.extname(entry.name).toLowerCase();
    if (TEXT_EXTENSIONS.includes(ext)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
        if (content.includes(pattern)) {
          // Exceção: permite a string "Authorization:" se estiver em um contexto seguro explicito (opcional), 
          // mas por enquanto vamos falhar.
          
          // Encontra a linha do erro para logar
          const lines = content.split('\n');
          const lineIndex = lines.findIndex(line => line.includes(pattern));
          const lineContent = lines[lineIndex].trim().substring(0, 50); // Mostra primeiros 50 chars
          
          throw new Error(`Potential secret found in ${fullPath} (line ${lineIndex + 1}): "${pattern}"\nContext: ${lineContent}...`);
        }
      }
    }
  }
}

function validateRootForEnv() {
  // Verifica apenas se existem arquivos .env ou .liquid na raiz
  if (fs.existsSync('.env')) throw new Error('Forbidden file found in root: .env');
  const rootFiles = fs.readdirSync('.');
  for (const file of rootFiles) {
    if (file.endsWith('.liquid')) throw new Error(`Forbidden file found in root: ${file}`);
  }
}

try {
  console.log(`Validating public repository (Scope: ${TARGET_DIR})...`);
  
  // 1. Validação rápida na raiz
  validateRootForEnv();

  // 2. Scan profundo no diretório alvo
  // Se o usuário passou ".", ele vai escanear tudo exceto IGNORE_DIRS
  // Se passou "blog", escaneia só blog
  scanDirectory(TARGET_DIR);

  console.log('Validation successful!');
} catch (error) {
  console.error('Validation failed:', error.message);
  process.exit(1);
}
