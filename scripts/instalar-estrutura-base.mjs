import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

const origem = process.argv[2];
if (!origem) throw new Error('Informe o arquivo da estrutura base.');
const conteudo = readFileSync(origem, 'utf8').replaceAll('\r\n', '\n');
const parte = conteudo.split('## Parte 3 — Arquivos (conteúdo exato)')[1]?.split('## Parte 4 — Verificação')[0];
if (!parte) throw new Error('Parte 3 não encontrada.');
const blocos = [...parte.matchAll(/^#### `([^`]+)`[^\n]*\n[\s\S]*?^~~~~[^\n]*\n([\s\S]*?)^~~~~\s*$/gm)];
const pendentes = new Set(['.env.example', 'docs/regras-negocio.md', 'drizzle.config.ts', '.github/workflows/deploy.yml', 'src/lib/db/index.ts']);
const manifesto = [];
for (const [, caminho, bruto] of blocos) {
  const destino = resolve(caminho);
  const rel = relative(process.cwd(), destino);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Caminho fora do projeto.');
  let texto = bruto;
  if (caminho === 'AGENTS.md') texto = texto.replace('[NOME DO PROJETO]', 'AtendeIA TMF').replace('[Uma ou duas frases: o que o sistema faz, para quem, e o que não pode dar errado.]', 'Sistema de atendimento e configuração de chatbots para WhatsApp, integrado à Evolution. Credenciais e dados de atendimento devem ser preservados; a interface ainda contém módulos demonstrativos.');
  const existe = existsSync(destino);
  if (pendentes.has(caminho) || existe) {
    manifesto.push({ caminho, estado: existe ? 'preservado: arquivo existente' : 'aguarda adaptação', linhas: texto.split('\n').length });
    continue;
  }
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, texto);
  manifesto.push({ caminho, estado: 'criado', linhas: texto.split('\n').length });
}
if (!existsSync('CLAUDE.md')) writeFileSync('CLAUDE.md', '@AGENTS.md\n');
for (const caminho of ['src/lib/validators', 'src/lib/actions', 'src/app/(app)', 'tests']) mkdirSync(caminho, { recursive: true });
mkdirSync('docs', { recursive: true });
writeFileSync('docs/instalacao-base-manifesto.json', JSON.stringify(manifesto, null, 2) + '\n');
console.log(JSON.stringify(manifesto, null, 2));
