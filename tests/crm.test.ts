import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { criarFunil, criarMotivo, catalogoCrm, definirAcessos, alterarMotivo } from "../src/lib/crm/cadastros";
import { criarOportunidade, encerrarOportunidade, moverOportunidade } from "../src/lib/crm/oportunidades";
import { consultarCrm } from "../src/lib/crm/consultas";
import type { SessaoAtiva } from "../src/lib/auth/permissoes";

test("CRM protege funis no backend e preserva fechamento, precisão monetária e colisão", async () => {
  const cliente = new PGlite(); const banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    const usuario = async (papel: SessaoAtiva["papel"]) => ({ userId: (await cliente.query<{ id: string }>("INSERT INTO atendeia_users(name,role,enabled,modified_by) VALUES ($1,$1,true,$2) RETURNING id", [papel,systemUserId])).rows[0].id, papel });
    const admin = await usuario("admin"), operador = await usuario("operador"), leitor = await usuario("visualizador");
    const funil = await criarFunil(banco, admin, { nome: "Comercial", etapas: ["Novo", "Proposta"] });
    const secreto = await criarFunil(banco, admin, { nome: "Financeiro", etapas: ["Entrada"] });
    const motivoId = await criarMotivo(banco, admin, { nome: "Sem orçamento" });
    await assert.rejects(criarFunil(banco, operador, { nome: "Indevido", etapas: ["A"] }), /permissao/);
    assert.equal((await catalogoCrm(banco, operador)).funis.length, 0);
    await definirAcessos(banco, admin, { usuarioId: operador.userId, version: 0, funis: [funil], motivo: "Atendimento comercial" });
    const catalogo = await catalogoCrm(banco, admin);
    const primeira = catalogo.etapas.find(e => e.funilId === funil && e.ordem === 0)!.id;
    const segunda = catalogo.etapas.find(e => e.funilId === funil && e.ordem === 1)!.id;
    const estrangeira = catalogo.etapas.find(e => e.funilId === secreto)!.id;
    const dados = { titulo: "Matrícula", valor: "100.10", funilId: funil, etapaId: primeira, responsavelId: operador.userId };
    await assert.rejects(criarOportunidade(banco, operador, { ...dados, funilId: secreto, etapaId: estrangeira }), /permissão/);
    await assert.rejects(criarOportunidade(banco, operador, { ...dados, etapaId: estrangeira }), /Etapa/);
    await assert.rejects(criarOportunidade(banco, leitor, dados), /permissao/);
    await criarOportunidade(banco, admin, { ...dados, titulo: "Reservada", funilId: secreto, etapaId: estrangeira, responsavelId: admin.userId, valor: "999.99" });
    const id = await criarOportunidade(banco, operador, dados);
    const original = (await consultarCrm(banco, operador, {})).itens.find(i => i.id === id)!;
    await moverOportunidade(banco, operador, { id, updatedAt: original.updatedAt, etapaId: segunda });
    await assert.rejects(encerrarOportunidade(banco, operador, { id, updatedAt: original.updatedAt, status: "ganha", motivoId: null }), /alterado/);
    const atual = (await consultarCrm(banco, operador, {})).itens.find(i => i.id === id)!;
    await encerrarOportunidade(banco, operador, { id, updatedAt: atual.updatedAt, status: "ganha", motivoId: null });
    await assert.rejects(encerrarOportunidade(banco, operador, { id, updatedAt: atual.updatedAt, status: "ganha", motivoId: null }), /alterado/);
    const perda = await criarOportunidade(banco, operador, { ...dados, valor: "200.20" });
    const ultima = (await consultarCrm(banco, operador, {})).itens.find(i => i.id === perda)!;
    await encerrarOportunidade(banco, operador, { id: perda, updatedAt: ultima.updatedAt, status: "perdida", motivoId });
    const consulta = await consultarCrm(banco, operador, {});
    assert.deepEqual(consulta.resumo, { total: 2, ganhas: 1, perdidas: 1, receita: "100.10", conversao: "50.00" });
    assert.equal(consulta.perdas[0].valor, "200.20");
    assert.equal((await consultarCrm(banco, operador, { funilId: secreto })).resumo.total, 0);
    const historico = (await cliente.query<{ etapa_anterior_id: string; modified_by: string; valor: string }>("SELECT etapa_anterior_id,modified_by,valor FROM atendeia_funis_oportunidades_fechamentos WHERE oportunidade_id=$1", [id])).rows[0];
    assert.equal(historico.etapa_anterior_id, segunda); assert.equal(historico.modified_by, operador.userId); assert.equal(historico.valor, "100.10");
    const motivo = (await catalogoCrm(banco, admin)).motivos[0];
    await alterarMotivo(banco, admin, { id: motivo.id, updatedAt: motivo.updatedAt, nome: "Nome alterado", excluir: true });
    assert.equal((await consultarCrm(banco, operador, {})).perdas[0].motivo, "Sem orçamento");
    await assert.rejects(definirAcessos(banco, admin, { usuarioId: operador.userId, version: 0, funis: [], motivo: "Edição desatualizada" }), /alterado/);
    await definirAcessos(banco, admin, { usuarioId: operador.userId, version: 1, funis: [], motivo: "Removido do comercial" });
    assert.equal((await consultarCrm(banco, operador, {})).resumo.total, 0);
    // Um papel forjado pelo chamador não substitui o papel do banco.
    await assert.rejects(criarFunil(banco, { ...operador, papel: "super_admin" }, { nome: "Forjado", etapas: ["A"] }));
  } finally { await cliente.close(); }
});
