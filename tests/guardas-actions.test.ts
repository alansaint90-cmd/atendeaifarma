import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

test("todas as actions exportadas passam por guardas reais, incluindo aliases de importação", () => {
  const arquivos = readdirSync("src/lib/actions").filter(f => f.endsWith(".ts")).map(f => path.resolve("src/lib/actions",f));
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const opcoes = ts.parseJsonConfigFileContent(config.config,ts.sys,process.cwd()).options;
  const programa = ts.createProgram(arquivos,opcoes); const checker = programa.getTypeChecker();
  for (const arquivo of arquivos) {
    const fonte = programa.getSourceFile(arquivo)!;
    for (const declaracao of fonte.statements) {
      if (!ts.isFunctionDeclaration(declaracao) || !declaracao.modifiers?.some(m => m.kind===ts.SyntaxKind.ExportKeyword)) continue;
      const guardas = new Set<string>();
      function visitar(no: ts.Node) {
        if (ts.isCallExpression(no)) {
          let simbolo = checker.getSymbolAtLocation(no.expression);
          if (simbolo && simbolo.flags & ts.SymbolFlags.Alias) simbolo = checker.getAliasedSymbol(simbolo);
          for (const d of simbolo?.declarations ?? []) {
            const caminho = d.getSourceFile().fileName.replaceAll("\\","/");
            if (caminho.endsWith("/auth/sessao.ts") && simbolo?.name === "exigirSessao") guardas.add("sessao");
            if (caminho.endsWith("/auth/permissoes.ts") && simbolo?.name === "exigirPermissao") {
              assert.ok(ts.isAwaitExpression(no.parent), `${arquivo}: permissão assíncrona precisa de await`);
              guardas.add("papel");
            }
          }
        }
        ts.forEachChild(no,visitar);
      }
      visitar(declaracao);
      assert.ok(guardas.has("sessao") && guardas.has("papel"), `${arquivo}: ${declaracao.name?.text} sem sessão individual e permissão`);
    }
  }
});
