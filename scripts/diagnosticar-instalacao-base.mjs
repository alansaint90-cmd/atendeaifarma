import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('tests/artifacts/estrutura-base', { recursive: true });
const comandos = [
  ['compliance', process.execPath, ['scripts/check-compliance.mjs']],
  ['docs-check', process.execPath, ['scripts/docs-check.mjs']],
  ['ai-marks', process.execPath, ['scripts/remove-ai-marks.mjs', '--check', '--dir', 'docs']],
  ['typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['lint', process.execPath, ['node_modules/eslint/bin/eslint.js', '.']],
  ['docker', 'docker', ['compose', 'ps']],
  ['hook', 'git', ['hook', 'run', 'pre-commit']],
];
const resumo = [];
for (const [nome, executavel, argumentos] of comandos) {
  const resultado = spawnSync(executavel, argumentos, { encoding: 'utf8', timeout: 60000, windowsHide: true });
  const texto = [resultado.stdout, resultado.stderr, resultado.error?.message].filter(Boolean).join('\n');
  writeFileSync(`tests/artifacts/estrutura-base/${nome}.txt`, texto);
  resumo.push({ comando: nome, codigo: resultado.status, erro: resultado.error?.code });
  console.log(`${nome}: ${resultado.error?.code ?? resultado.status}`);
}
writeFileSync('tests/artifacts/estrutura-base/resumo.json', JSON.stringify(resumo, null, 2));
