// Monta painel/dist/painel.html (servido pelo Worker) a partir das partes. Funciona em Windows/Mac/Linux.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const r = (f) => readFileSync(new URL('./painel/' + f, import.meta.url), 'utf8');
mkdirSync(new URL('./painel/dist/', import.meta.url), { recursive: true });
const html = r('1-head.html') + '\n<!--BODY-->\n' + r('2-body.html') + '\n<script>\n' + r('3-demo.js') + '\n' + r('3b-snapshot.js') + '\n' + r('3c-live.js') + '\n' + r('4-app.js') + '\n</script>\n';
writeFileSync(new URL('./painel/dist/painel.html', import.meta.url), html);
console.log('painel/dist/painel.html', html.length, 'bytes');
