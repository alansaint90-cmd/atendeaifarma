import ts from "typescript";

/** Analisa somente fábricas locais, sem executar o código do schema. */
export function colunasDasFabricas(content, colunas) {
  const source = ts.createSourceFile("schema.ts", content, ts.ScriptTarget.Latest, true);
  const fabricas = new Map();
  const resultado = new Map();
  const desembrulhar = node => {
    while (node && ts.isParenthesizedExpression(node)) node = node.expression;
    return node;
  };
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const fn = declaration.initializer;
      if (!ts.isIdentifier(declaration.name) || !fn || !ts.isArrowFunction(fn) || fn.parameters.length) continue;
      const body = desembrulhar(fn.body);
      if (ts.isObjectLiteralExpression(body)) fabricas.set(declaration.name.text, body);
    }
  }
  // Dependências entre fábricas são resolvidas até estabilizar, inclusive ciclos.
  for (let rodada = 0; rodada < fabricas.size; rodada++) {
    for (const [nome, body] of fabricas) {
      const found = new Set(resultado.get(nome));
      for (const property of body.properties) {
        if (ts.isSpreadAssignment(property)) {
          const call = desembrulhar(property.expression);
          if (ts.isCallExpression(call) && ts.isIdentifier(call.expression) && !call.arguments.length) {
            for (const col of resultado.get(call.expression.text) ?? []) found.add(col);
          }
        } else if (ts.isPropertyAssignment(property)) {
          const name = property.name;
          if ((ts.isIdentifier(name) || ts.isStringLiteral(name)) && colunas.includes(name.text)) found.add(name.text);
          let value = property.initializer;
          // uuid("modified_by").notNull().references(...) -> uuid("modified_by").
          while (ts.isCallExpression(value)) {
            if (ts.isIdentifier(value.expression)) {
              const arg = value.arguments[0];
              if (arg && ts.isStringLiteral(arg) && colunas.includes(arg.text)) found.add(arg.text);
              break;
            }
            if (!ts.isPropertyAccessExpression(value.expression)) break;
            value = value.expression.expression;
          }
        }
      }
      resultado.set(nome, found);
    }
  }
  return resultado;
}
