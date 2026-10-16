// Compatibilidade com a estrutura base: mantém o schema e histórico do AtendeIA.
import config from "./config/drizzle.config";
try { process.loadEnvFile(); } catch { /* Variáveis podem vir do ambiente. */ }
const configuracao = { ...config, dbCredentials: { url: process.env.DATABASE_URL ?? "" } };
export default configuracao;
