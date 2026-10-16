"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { salvarMeuPerfil } from "@/lib/actions/perfil";
import type { DadosPerfil } from "@/lib/perfil/servico";

interface PerfilDadosProps { inicial: DadosPerfil }

export function PerfilDados({ inicial }: PerfilDadosProps) {
  const router = useRouter();
  const [salvo, setSalvo] = useState(inicial);
  const [nome, setNome] = useState(inicial.nome);
  const [celular, setCelular] = useState(inicial.celular);
  const [foto, setFoto] = useState<string | null>(inicial.foto);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const iniciais = nome.trim().split(/\s+/).slice(0, 2).map(parte => parte[0]?.toLocaleUpperCase("pt-BR")).join("") || "?";

  async function selecionarFoto(arquivo?: File) {
    setErro(""); setMensagem("");
    if (!arquivo) return;
    if (!["image/jpeg", "image/png"].includes(arquivo.type) || arquivo.size > 2 * 1024 * 1024 || !arquivo.size) {
      setErro("Escolha uma foto JPG ou PNG de até 2 MB."); return;
    }
    const leitor = new FileReader();
    leitor.onload = () => { if (typeof leitor.result === "string") setFoto(leitor.result); else setErro("Não foi possível ler a foto."); };
    leitor.onerror = () => setErro("Não foi possível ler a foto.");
    leitor.readAsDataURL(arquivo);
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setOcupado(true); setErro(""); setMensagem("");
    try {
      const resultado = await salvarMeuPerfil({ nome, celular, foto, version: salvo.version });
      if (!resultado.ok) { setErro(resultado.erro); return; }
      setSalvo(resultado.dados); setNome(resultado.dados.nome); setCelular(resultado.dados.celular);
      setFoto(resultado.dados.foto); setMensagem("Cadastro atualizado."); router.refresh();
    } catch { setErro("Não foi possível salvar o cadastro."); }
    finally { setOcupado(false); }
  }

  return <section className="panel profile-card"><h2>Meus dados</h2>
    <form className="profile-data-form" onSubmit={evento => void salvar(evento)}>
      <div className="profile-photo-row">
        <span className="profile-avatar" aria-label={`Foto de ${nome}`}>
          {foto ? <Image unoptimized src={foto} alt={`Foto de ${nome}`} width={94} height={94} /> : iniciais}
        </span>
        <div className="profile-photo-actions"><div>
          <label className="profile-upload">Alterar foto<input type="file" accept="image/jpeg,image/png" disabled={ocupado} onChange={evento => { void selecionarFoto(evento.target.files?.[0]); evento.target.value = ""; }} /></label>
          <button type="button" className="secondary" disabled={ocupado || !foto} onClick={() => { setFoto(null); setMensagem(""); }}>Remover foto</button>
        </div><small>Imagens permitidas: JPG e PNG, com tamanho máximo de 2 MB.</small></div>
      </div>
      <div className="profile-fields"><label>Nome<input required minLength={2} maxLength={120} value={nome} disabled={ocupado} onChange={evento => setNome(evento.target.value)} /></label>
        <label>Celular<input type="tel" inputMode="tel" maxLength={25} value={celular} disabled={ocupado} onChange={evento => setCelular(evento.target.value)} placeholder="(00) 00000-0000" /></label></div>
      <p className="profile-email">E-mail de acesso: <strong>{salvo.email}</strong></p>
      {erro && <p role="alert">{erro}</p>}{mensagem && <p role="status">{mensagem}</p>}
      <div className="profile-form-actions"><button type="button" className="secondary" disabled={ocupado} onClick={() => { setNome(salvo.nome); setCelular(salvo.celular); setFoto(salvo.foto); setErro(""); setMensagem(""); }}>Cancelar</button>
        <button type="submit" className="primary" disabled={ocupado}>{ocupado ? "Salvando..." : "Salvar"}</button></div>
    </form>
  </section>;
}
