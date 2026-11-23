import { administradorHttp } from "@/lib/auth/acesso-http";
import { db } from "@/lib/db/client";
import { recuperarAudioHistorico } from "@/lib/farmacia/audio-historico";

export const dynamic = "force-dynamic";
const headersPrivados = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const acesso = await administradorHttp("operador");
  if (acesso.erro) return Response.json({ erro: "Acesso não autorizado." }, { status: acesso.erro, headers: headersPrivados });
  try {
    const { id } = await contexto.params;
    const audio = await recuperarAudioHistorico(db(), acesso.sessao, id);
    const total = audio.bytes.byteLength;
    const headers = { ...headersPrivados, "Content-Type": audio.mime, "Accept-Ranges": "bytes" };
    const range = request.headers.get("range");
    if (range) {
      const partes = /^bytes=(\d*)-(\d*)$/.exec(range);
      const inicio = partes?.[1] ? Number(partes[1]) : partes?.[2] ? Math.max(0, total - Number(partes[2])) : NaN;
      const fim = partes?.[1] && partes[2] ? Math.min(total - 1, Number(partes[2])) : total - 1;
      if (!Number.isSafeInteger(inicio) || !Number.isSafeInteger(fim) || inicio < 0 || inicio >= total || fim < inicio) {
        return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${total}` } });
      }
      return new Response(audio.bytes.slice(inicio, fim + 1), { status: 206, headers: { ...headers, "Content-Range": `bytes ${inicio}-${fim}/${total}`, "Content-Length": String(fim - inicio + 1) } });
    }
    return new Response(audio.bytes, { headers: { ...headers, "Content-Length": String(total) } });
  } catch {
    return Response.json({ erro: "Áudio indisponível. Atualize a conversa e tente novamente." }, { status: 404, headers: headersPrivados });
  }
}
