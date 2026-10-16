import { argon2, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ErroDeNegocio } from "../acao";

export const senhaEntrada = z.string().min(1).max(256);
export const novaSenha = z.string().min(15, "Use ao menos 15 caracteres.").max(256, "Use até 256 caracteres.");
const parametros = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 };
const derivar = (senha: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => {
  argon2("argon2id", { ...parametros, message: senha, nonce: salt }, (erro, hash) => erro ? reject(erro) : resolve(hash));
});
// Não é uma credencial: força o mesmo KDF quando a conta não existe ou não tem senha.
const saltFicticio = randomBytes(16);
export async function conferirSenha(senha: string, hash: string | null): Promise<boolean> {
  senhaEntrada.parse(senha);
  const partes = hash?.match(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$([A-Za-z0-9+/]{22}==)\$([A-Za-z0-9+/]{43}=)$/);
  const calculado = await derivar(senha, partes ? Buffer.from(partes[1], "base64") : saltFicticio);
  return !!partes && timingSafeEqual(calculado, Buffer.from(partes[2], "base64"));
}
export async function prepararSenha(entrada: string, request = fetch) {
  const senha = novaSenha.parse(entrada); let aviso: string | null = null;
  // HIBP recebe somente os cinco primeiros caracteres do SHA-1, nunca a senha.
  const resumo = createHash("sha1").update(senha).digest("hex").toUpperCase();
  let vazada = false;
  try {
    const resposta = await request(`https://api.pwnedpasswords.com/range/${resumo.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" }, redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) throw new Error("Indisponível");
    const texto = await resposta.text();
    vazada = texto.split(/\r?\n/).some(linha => {
      const [sufixo, quantidade] = linha.split(":");
      return sufixo === resumo.slice(5) && Number(quantidade) > 0;
    });
  } catch { aviso = "A consulta de senhas vazadas está indisponível. A senha foi aceita; prefira uma frase exclusiva."; }
  if (vazada) throw new ErroDeNegocio("Essa senha consta em vazamentos. Escolha outra frase exclusiva.");
  const salt = randomBytes(16); const hash = await derivar(senha, salt);
  return { hash: `$argon2id$v=19$m=19456,t=2,p=1$${salt.toString("base64")}$${hash.toString("base64")}`, aviso };
}
