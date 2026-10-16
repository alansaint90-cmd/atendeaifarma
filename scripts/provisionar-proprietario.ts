import { open, realpath, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { db, closeDatabase } from "../src/lib/db/client";
import { ensureDatabase } from "../src/lib/db/migrate";
import { novoToken } from "../src/lib/auth/repositorio";
import { configuracaoPasskey } from "../src/lib/auth/passkeys";
import { provisionarProprietario } from "../src/lib/auth/provisionamento-proprietario";

type Etapa = "validacao_de_variaveis" | "configuracao_de_origem" | "diretorio_do_convite" | "migracoes_ou_conexao_do_banco" | "arquivo_de_convite" | "provisionamento_no_banco";
let etapa: Etapa = "validacao_de_variaveis";
let arquivoCriado: string | undefined;

function diagnosticoSeguro(erro: unknown) {
  const mensagem = erro instanceof Error ? erro.message : "";
  if (mensagem.includes("Já existe proprietário")) return "proprietario_ja_existe";
  if (mensagem.includes("EEXIST")) return "arquivo_de_convite_ja_existe";
  return etapa;
}

// Execução manual com acesso administrativo ao servidor. Nunca no entrypoint ou seed.
async function main() {
  const config = z.strictObject({ nome: z.string().trim().min(2).max(120), email: z.email(), arquivo: z.string().min(1) }).parse({
    nome: process.env.PROVISIONAR_NOME, email: process.env.PROVISIONAR_EMAIL, arquivo: process.env.PROVISIONAR_ARQUIVO,
  });
  etapa = "configuracao_de_origem";
  configuracaoPasskey();
  etapa = "diretorio_do_convite";
  const solicitado = path.resolve(config.arquivo);
  const destino = path.join(await realpath(path.dirname(solicitado)), path.basename(solicitado));
  const relativo = path.relative(await realpath(process.cwd()), destino);
  if (!relativo.startsWith(".." + path.sep) && !path.isAbsolute(relativo)) throw new Error("Use uma pasta privada fora do repositório para o convite.");
  etapa = "migracoes_ou_conexao_do_banco";
  await ensureDatabase();
  const token = novoToken();
  // Não sobrescreve um arquivo existente e não exibe o convite em logs.
  etapa = "arquivo_de_convite";
  const arquivo = await open(destino, "wx", 0o600);
  arquivoCriado = destino;
  try {
    if (process.platform === "win32") {
      if (!process.env.USERDOMAIN || !process.env.USERNAME) throw new Error("Identidade local indisponível.");
      execFileSync("icacls.exe", [destino, "/inheritance:r", "/grant:r", `${process.env.USERDOMAIN}\\${process.env.USERNAME}:F`], { windowsHide: true, stdio: "ignore" });
    }
    await arquivo.writeFile(token, "utf8");
  } finally { await arquivo.close(); }
  etapa = "provisionamento_no_banco";
  await provisionarProprietario(db(), { nome: config.nome, email: config.email, token,
    reiniciar: process.env.PROVISIONAR_REINICIAR_PROPRIETARIO === "true" });
  arquivoCriado = undefined;
  console.log("Proprietário provisionado. O convite foi salvo no arquivo privado informado e expira em 15 minutos.");
}
main().catch(async erro => {
  if (arquivoCriado) await unlink(arquivoCriado).catch(() => {});
  const detalhe = process.env.PROVISIONAR_DIAGNOSTICO === "true" ? ` Diagnóstico seguro: ${diagnosticoSeguro(erro)}.` : "";
  console.error(`Provisionamento não concluído.${detalhe} Confira configuração, arquivo privado e existência de proprietário. Nenhuma credencial foi exibida.`);
  process.exitCode = 1;
}).finally(closeDatabase);
