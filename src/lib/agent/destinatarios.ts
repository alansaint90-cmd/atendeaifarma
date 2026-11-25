const numeroInternacional = /^[1-9]\d{6,14}$/;
const numeroNacionalBrasil = /^[1-9]\d(?:[2-5]\d{7}|9\d{8})$/;

export function normalizarNumeroTeste(valor: string) {
  const texto = valor.trim();
  if (!/^\+?[\d(). -]+$/.test(texto)) return null;
  const digitos = texto.replace(/\D/g, "");
  if (numeroNacionalBrasil.test(digitos) && !texto.startsWith("+")) return `55${digitos}`;
  if ((texto.startsWith("+") || /^55\d{10,11}$/.test(digitos)) && numeroInternacional.test(digitos)) return digitos;
  return null;
}

export function agentePermiteDestinatario(settings: { AI_TEST_MODE?: string; AI_TEST_WHATSAPP_NUMBER?: string }, numero: string) {
  if (settings.AI_TEST_MODE === undefined || settings.AI_TEST_MODE === "false") return true;
  if (settings.AI_TEST_MODE !== "true" || !numeroInternacional.test(numero)) return false;
  const autorizado = normalizarNumeroTeste(settings.AI_TEST_WHATSAPP_NUMBER ?? "");
  if (!autorizado) return false;
  if (autorizado === numero) return true;

  // A Evolution pode identificar um celular brasileiro pelo formato anterior, sem o nono dígito.
  const celular = autorizado.match(/^(55[1-9]\d)9([6-9]\d{7})$/);
  return celular !== null && numero === `${celular[1]}${celular[2]}`;
}
