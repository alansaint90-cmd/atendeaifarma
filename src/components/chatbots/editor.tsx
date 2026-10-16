"use client";
import { useEffect, useRef, useState } from "react";
import { chatbotSchema, personalities, type Chatbot } from "@/lib/chatbots/schema";

interface Props { initial: Chatbot; creating: boolean; onSave: (bot: Chatbot) => void; onClose: () => void; error: string }
export function ChatbotEditor({ initial, creating, onSave, onClose, error }: Props) {
  const [draft, setDraft] = useState<Chatbot>(() => structuredClone(initial));
  const [validation, setValidation] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    document.body.classList.add("bot-modal-open");
    return () => { element.close(); document.body.classList.remove("bot-modal-open"); if (opener instanceof HTMLElement) opener.focus(); };
  }, []);
  const update = <K extends keyof Chatbot>(key: K, value: Chatbot[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const textField = (key: "identifier" | "persona" | "mission" | "context" | "fallback" | "transferNotice" | "closingPhrase", title: string, rows?: number) =>
    <label>{title}{rows ? <textarea name={key} rows={rows} value={draft[key]} onChange={e => update(key, e.target.value)} /> : <input name={key} value={draft[key]} required={key === "identifier" || key === "persona"} maxLength={key === "closingPhrase" ? 500 : 100} onChange={e => update(key, e.target.value)} />}</label>;
  return <dialog ref={dialog} className="bot-dialog" aria-labelledby="bot-title" onCancel={onClose}>
    <form className="bot-form" onSubmit={event => {
      event.preventDefault();
      const parsed = chatbotSchema.safeParse({ ...draft, openingMessages: draft.openingMessages?.map(texto => texto.trim()).filter(Boolean) });
      if (!parsed.success) { setValidation(parsed.error.issues[0].message); return; }
      setValidation(""); onSave(parsed.data);
    }}>
      <header className="bot-dialog-head"><div><h2 id="bot-title">{creating ? "Criação" : "Configuração"} de chatbot inteligente</h2><p>Defina as características e o conhecimento do seu assistente.</p></div><button type="button" className="icon-button" aria-label="Fechar janela" onClick={onClose}>×</button></header>
      <div className="bot-dialog-body">
        <div className="bot-identifier">{textField("identifier", "Identificador do chatbot")}</div>
        <section className="bot-section"><h2>Persona</h2><p>Aqui vamos definir quem é o seu chatbot.</p><div className="bot-persona-grid">
          {textField("persona", "Nome da persona")}
          <label>Gênero<select name="gender" value={draft.gender} onChange={e => update("gender", e.target.value as Chatbot["gender"])}>{["Feminino", "Masculino", "Neutro"].map(value => <option key={value}>{value}</option>)}</select></label>
          <fieldset className="bot-personalities"><legend>Personalidade (escolha até 3)</legend><div>{personalities.map(value => <label key={value}><input name="personalities" type="checkbox" checked={draft.personalities.includes(value)} disabled={draft.personalities.length >= 3 && !draft.personalities.includes(value)} onChange={e => update("personalities", e.target.checked ? [...draft.personalities, value] : draft.personalities.filter(item => item !== value))} /><span>{value}</span></label>)}</div></fieldset>
        </div>{textField("mission", "Missão do chatbot", 2)}<details className="bot-examples"><summary>Exemplos de missão (para copiar e alterar)</summary><p>Atender clientes, esclarecer dúvidas sobre produtos e serviços e orientar cada pessoa até a melhor solução.</p><button type="button" className="secondary" onClick={() => update("mission", "Atender clientes, esclarecer dúvidas sobre produtos e serviços e orientar cada pessoa até a melhor solução.")}>Usar exemplo</button></details></section>
        <section className="bot-section"><h2>Contexto e conhecimento do chatbot</h2><p>Inclua o prompt e todas as informações que o assistente precisa conhecer.</p>{textField("context", "Contexto geral", 12)}{textField("fallback", "Como agir se não tiver a resposta?", 2)}
          <details className="bot-examples"><summary>Exemplos de textos (para copiar e alterar)</summary><p>Não tenho essa informação no momento. Posso ajudar com outro assunto ou encaminhar você para nossa equipe?</p><button className="secondary" type="button" onClick={() => update("fallback", "Não tenho essa informação no momento. Posso ajudar com outro assunto ou encaminhar você para nossa equipe?")}>Usar exemplo</button></details>
        </section>
        <section className="bot-section"><h2>Abertura da conversa</h2><p>Opcional: até duas mensagens separadas, enviadas literalmente ao receber apenas uma saudação no primeiro contato. Deixe ambas vazias para usar o prompt.</p>
          {[0, 1].map(indice => <label key={indice}>Mensagem de abertura {indice + 1}<textarea rows={3} maxLength={2000} value={draft.openingMessages?.[indice] ?? ""} onChange={event => {
            const mensagens = [...(draft.openingMessages ?? ["", ""])]; mensagens[indice] = event.target.value;
            update("openingMessages", mensagens);
          }} /></label>)}
        </section>
        <section className="bot-section"><h2>Ajustes gerais</h2><p>Configure suas preferências de atendimento.</p><div className="bot-settings-grid">
          <label>Atraso na resposta (em segundos)<input name="delay" type="number" min="0" max="3600" step="1" required value={draft.delay} onChange={e => update("delay", e.target.valueAsNumber)} /><small>Digite 0 para responder imediatamente.</small></label>
          <label className="bot-switch"><input type="checkbox" checked={draft.transferMedia} onChange={e => update("transferMedia", e.target.checked)} />Transferir a conversa ao receber imagens ou documentos</label>
        </div><label className="bot-switch"><input type="checkbox" checked={draft.transferHuman} onChange={e => update("transferHuman", e.target.checked)} />Transferir a conversa quando o contato solicitar atendimento humano</label>
          <fieldset className="bot-transfer-fields" disabled={!draft.transferMedia && !draft.transferHuman}>
            <label>Transferir para?<select value={draft.destination} onChange={e => update("destination", e.target.value as Chatbot["destination"])}>{["Atendimento humano", "Comercial", "Suporte", "Financeiro"].map(value => <option key={value}>{value}</option>)}</select></label>
            {textField("transferNotice", "Aviso de transferência para atendimento humano", 2)}<small>Escreva literalmente o que o chatbot irá dizer no momento da transferência.</small>
            {textField("closingPhrase", "Frase secreta para encerrar atendimento humano")}<small>Quando a integração estiver ativa, essa frase identificará o encerramento do atendimento humano. Use exatamente o texto cadastrado.</small>
          </fieldset>
        </section>
        <section className="bot-section"><h2>Fluxos inteligentes</h2><p>Descreva quando cada fluxo deve ser acionado durante a conversa.</p>{draft.flows.map((flow, index) => <div className="bot-flow-row" key={index}>
          <label>Nome do fluxo<input data-flow-name value={flow.name} required onChange={e => update("flows", draft.flows.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} /></label>
          <label>Quando acionar este fluxo?<textarea data-flow-description value={flow.description} required onChange={e => update("flows", draft.flows.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} /></label>
          <button type="button" className="secondary" onClick={() => update("flows", draft.flows.filter((_, i) => i !== index))}>Remover</button>
        </div>)}<button type="button" className="primary" data-add-flow disabled={draft.flows.length >= 50} onClick={() => update("flows", [...draft.flows, { name: "", description: "" }])}>+ Adicionar fluxo</button></section>
        <section className="bot-section"><h2>Temperatura</h2><p>Valores menores priorizam precisão. Valores maiores aumentam a variedade das respostas. Sugestão: 0,5 para uso geral, próximo de 0 para cálculos e 0,8 para comunicação criativa.</p><label className="bot-temperature">Criatividade das respostas<output>{draft.temperature.toFixed(1).replace(".", ",")}</output><input name="temperature" type="range" min="0" max="1" step="0.1" value={draft.temperature} onChange={e => update("temperature", Number(e.target.value))} /></label><div className="bot-range-labels"><span>0 · Mais preciso</span><span>1 · Mais criativo</span></div></section>
      </div><footer className="bot-dialog-footer"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><p role="alert">{validation || error}</p><button className="primary" type="submit">Salvar</button></footer>
    </form>
  </dialog>;
}
