# Blog Public (Repo Público)

Este repositório atua como um "Headless CMS" para o Blog Vagalimitada.
Ele hospeda apenas arquivos estáticos (JSON, imagens) que são consumidos pelo frontend.

## 📂 Estrutura

- `blog/posts/*.json`: Arquivos individuais de cada post.
- `blog/index.json`: Índice principal com todos os posts (gerado automaticamente).
- `blog/config.json`: Configurações globais (ex: canonical origin).
- `scripts/`: Scripts de build (index, rss, sitemap) executados pelo CI.

## ⚙️ CI/CD

Toda vez que o *Agent* posta algo novo aqui, o GitHub Actions dispara:
1. `scripts/build_index.mjs`:
   - Lê todos os posts.
   - Sanitiza dados (migra schemas antigos).
   - Valida slugs.
   - Gera `blog/index.json`.
2. `scripts/build_rss.mjs`: Gera feed RSS.
3. `scripts/build_sitemap.mjs`: Gera Sitemap.

## 🛡️ Segurança

- **NENHUMA** chave de API ou segredo deve estar neste repositório.
- O conteúdo é 100% público e acessível via `raw.githubusercontent.com`.

## 🎨 Frontend (.liquid)

O frontend (na Cartpanda) consome os dados daqui via `fetch()`.
- **Listagem**: Lê `blog/index.json`.
- **Post**: Lê `blog/posts/<slug>.json`.

## 🚨 Troubleshooting

Se o CI falhar:
- Verifique se o *Agent* criou um arquivo JSON onde o nome do arquivo difere do campo `slug` interno.
- O script de build tenta corrigir automaticamente, mas erros graves podem parar o build.
