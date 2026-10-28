import { useState, type FormEvent } from "react";
import { DemoPanel, DemoStatus } from "./DemoComponents";
import { useDemoStore } from "@/contexts/DemoStore";

export default function DemoCentersPanel() {
  const { state, addCenter, toggleCenter } = useDemoStore();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = addCenter({ name, code });
    if (!result.ok) { setMessage({ error: true, text: result.message }); return; }
    setName(""); setCode(""); setMessage({ error: false, text: "Centro DEMO criado. Ele já está disponível em Contas." });
  }
  return (
    <DemoPanel title="Centros de custo DEMO" subtitle="Centros ativos alimentam o seletor de Contas; inativação mantém vínculos históricos.">
      <form className="demo-form" onSubmit={submit}>
        <div className="demo-field"><label htmlFor="center-demo-name">Nome demonstrativo</label><input id="center-demo-name" className="demo-input" maxLength={120} required value={name} onChange={event => setName(event.target.value)} /></div>
        <div className="demo-field"><label htmlFor="center-demo-code">Código sintético</label><input id="center-demo-code" className="demo-input" maxLength={30} required value={code} onChange={event => setCode(event.target.value)} /></div>
        <div className="demo-actions"><button type="submit" className="demo-button">Criar centro DEMO</button></div>
      </form>
      {message ? <p className="demo-feedback" role={message.error ? "alert" : "status"}>{message.text}</p> : null}
      <div className="demo-table-wrap" style={{ marginTop: 16 }}>
        <table className="demo-table"><thead><tr><th>Código</th><th>Centro de custo</th><th>Estado</th><th>Ação local</th></tr></thead><tbody>
          {state.centers.map(center => <tr key={center.id}><td>{center.code}</td><td>{center.name}</td><td><DemoStatus tone={center.active ? "positive" : "neutral"}>{center.active ? "Ativo DEMO" : "Inativo DEMO"}</DemoStatus></td><td><button type="button" className="demo-button" onClick={() => { toggleCenter(center.id); setMessage({ error: false, text: `Centro DEMO ${center.active ? "inativado" : "reativado"}. Nenhum dado real alterado.` }); }}>{center.active ? "Inativar DEMO" : "Reativar DEMO"}</button></td></tr>)}
        </tbody></table>
      </div>
    </DemoPanel>
  );
}
