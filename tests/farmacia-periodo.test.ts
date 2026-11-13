import test from "node:test";
import assert from "node:assert/strict";
import { periodoFarmacia } from "../src/lib/farmacia/periodo";

test("atalhos usam o dia de Brasília, incluindo virada de mês e ano",()=>{
  const agora=new Date("2026-01-01T02:30:00Z");
  assert.deepEqual(periodoFarmacia("hoje",agora),{inicio:"2025-12-31",fim:"2025-12-31"});
  assert.deepEqual(periodoFarmacia("ontem",agora),{inicio:"2025-12-30",fim:"2025-12-30"});
  for(const [atalho,dias] of [["7dias",7],["15dias",15],["30dias",30]] as const){
    const p=periodoFarmacia(atalho,agora);assert.equal((Date.parse(p.fim)-Date.parse(p.inicio))/86400000+1,dias);
  }
});
