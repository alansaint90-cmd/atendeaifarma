import { z } from "zod";
import { ErroDeNegocio } from "../acao";

export const perfilSchema = z.strictObject({
  nome: z.string().trim().min(2, "Informe seu nome.").max(120, "Nome muito longo."),
  celular: z.string().trim().max(25, "Celular muito longo.").refine(valor => !valor || (/^[+()0-9\s-]+$/.test(valor) && valor.replace(/\D/g, "").length >= 10 && valor.replace(/\D/g, "").length <= 15), "Informe um celular válido com DDD."),
  foto: z.string().max(2_800_000, "A foto deve ter até 2 MB.").nullable(),
  version: z.number().int().min(0),
});

const tamanhoMaximo = 2 * 1024 * 1024;
export function validarFotoPerfil(foto: string | null) {
  if (foto === null) return;
  const partes = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(foto);
  if (!partes) throw new ErroDeNegocio("Envie uma imagem JPG ou PNG válida.");
  const bytes = Buffer.from(partes[2], "base64");
  if (!bytes.length || bytes.length > tamanhoMaximo || bytes.toString("base64") !== partes[2]) {
    throw new ErroDeNegocio("A foto deve ter até 2 MB e estar íntegra.");
  }
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (partes[1] === "png" ? !png : !jpeg) throw new ErroDeNegocio("O conteúdo da foto não corresponde ao formato informado.");
}
