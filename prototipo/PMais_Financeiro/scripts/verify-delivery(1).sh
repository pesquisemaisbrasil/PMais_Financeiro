#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm check
pnpm test
pnpm build
node --input-type=module - <<'JS'
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('client/public/manus-routes.json', 'utf8'));
const source = fs.readFileSync('client/src/App.tsx', 'utf8');
const required = [...source.matchAll(/<Route path="([^"]+)"/g)].map(match => match[1]).filter(path => path !== '/404');
const paths = data.routes.map(route => route.path);
for (const path of required) {
  if (!paths.includes(path)) throw new Error(`Rota informativa ausente: ${path}`);
}
if (new Set(paths).size !== paths.length) throw new Error('Rotas duplicadas');
if (paths.length !== required.length) throw new Error('Manifesto difere do conjunto de páginas atual');
console.log('Manifesto completo de rotas demo/informativas verificado.');
JS
