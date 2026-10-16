import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";

export async function exigirAdmin() {
  const sessao = await exigirSessao();
  await exigirPermissao(sessao, "super_admin");
  return sessao;
}
