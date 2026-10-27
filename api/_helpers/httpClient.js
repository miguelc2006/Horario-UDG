// api/_helpers/httpClient.js
// Cliente HTTP centralizado con hardening de seguridad para llamadas salientes.
import axios from 'axios';
import https from 'node:https';

// Agente HTTPS con validación estricta de TLS y versión mínima TLS 1.2
export const secureHttpsAgent = new https.Agent({
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    keepAlive: true,
});

/**
 * Instancia endurecida de Axios para mitigar:
 * - Denial of Service por respuestas de gran tamaño (límite de 8MB)
 * - Conexiones salientes a certificados inválidos o protocolos TLS deprecados
 * - Timeouts prolongados
 */
export const httpClient = axios.create({
    timeout: 15000,
    maxContentLength: 8 * 1024 * 1024, // 8 MB máximo de respuesta
    maxBodyLength: 8 * 1024 * 1024,    // 8 MB máximo de cuerpo
    httpsAgent: secureHttpsAgent,
});

export default httpClient;
