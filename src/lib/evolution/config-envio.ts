import { settingsSchema,type IntegrationSettings } from "../settings/schema";
import { instanciasConfiguradas } from "./instancias";
const envioSchema=settingsSchema.pick({EVOLUTION_API_URL:true,EVOLUTION_API_KEY:true,EVOLUTION_INSTANCE_NAME:true}).required();
/** Projeta somente os campos de envio; IA/Redis não fazem parte desta validação. */
export function configuracaoEnvio(settings:IntegrationSettings,instancia:string){
 return envioSchema.safeParse(instanciasConfiguradas(settings).includes(instancia)?{EVOLUTION_API_URL:settings.EVOLUTION_API_URL,EVOLUTION_API_KEY:settings.EVOLUTION_API_KEY,EVOLUTION_INSTANCE_NAME:instancia}:null);
}
