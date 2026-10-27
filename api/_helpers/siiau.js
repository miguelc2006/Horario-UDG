// api/_helpers/siiau.js
// Helper compartido para consultar SIIAU — reusa lógica de consultar-oferta.js
import { httpClient } from './httpClient.js';
import { load } from 'cheerio';
import iconv from 'iconv-lite';

const POST_URL = "https://siiauescolar.siiau.udg.mx/wal/sspseca.consulta_oferta";

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded'
};

const cleanDays = (dayString) => {
    if (!dayString) return [];
    const dayNames = { "L": "Lunes", "M": "Martes", "I": "Miércoles", "J": "Jueves", "V": "Viernes", "S": "Sábado" };
    const cleaned = [];
    for (const char of dayString) {
        if (dayNames[char]) cleaned.push(dayNames[char]);
    }
    return cleaned;
};

const parseTime = (timeStr) => {
    if (!timeStr || timeStr.length !== 4 || !/^\d+$/.test(timeStr)) return timeStr;
    return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
};

/**
 * Consulta un NRC específico en SIIAU.
 * @param {string} nrc - NRC de la materia
 * @param {string} ciclop - Ciclo (ej. "202510")
 * @param {string} cup - Centro (ej. "H")
 * @param {string} majrp - Carrera (ej. "INCO")
 * @returns {Promise<object|null>} Datos del NRC o null si no se encuentra
 */
export async function consultarNrc(nrc, ciclop, cup, majrp) {
    try {
        const postData = new URLSearchParams({
            ciclop, cup, majrp,
            mostrarp: "1000", crsep: "",
            materiap: "", horaip: "", horafp: "", edifp: "", aulap: "", ordenp: "0"
        });

        const response = await httpClient.post(POST_URL, postData.toString(), {
            headers, timeout: 20000, responseType: 'arraybuffer'
        });

        const html = iconv.decode(response.data, 'iso-8859-1');

        if (html.includes("ORA-01403")) return null;

        const $ = load(html);
        const rows = $('table tr');
        let found = null;

        rows.each((i, row) => {
            if (found) return;
            const cells = $(row).children('td');
            const nrcText = cells.eq(0).text().trim();

            if (cells.length >= 8 && nrcText === String(nrc)) {
                const baseInfo = {
                    nrc: nrcText,
                    clave: cells.eq(1).text().trim(),
                    materia: cells.eq(2).text().trim(),
                    seccion: cells.eq(3).text().trim(),
                    creditos: cells.eq(4).text().trim(),
                    cupos: parseInt(cells.eq(5).text().trim()) || 0,
                    disponibles: parseInt(cells.eq(6).text().trim()) || 0,
                };

                let profesor_asignado = "No asignado";
                const profCell = cells.eq(8).find('.tdprofesor');
                if (profCell.length > 0) {
                    profesor_asignado = profCell.last().text().trim();
                } else {
                    const text8 = cells.eq(8).text().trim();
                    if (text8 && !/^\d+$/.test(text8)) profesor_asignado = text8;
                }

                const sesiones = [];
                const horarioTable = cells.eq(7).find('table');

                if (horarioTable.length > 0) {
                    horarioTable.find('tr').each((j, sesRow) => {
                        const sesCells = $(sesRow).find('td');
                        if (sesCells.length >= 2) {
                            sesiones.push({
                                hora_str: sesCells.eq(1).text().trim(),
                                dias_str: sesCells.eq(2).text().trim(),
                                edificio: sesCells.eq(3).text().trim(),
                                aula: sesCells.eq(4).text().trim(),
                            });
                        }
                    });
                }

                const sesionesNormalizadas = [];
                if (sesiones.length > 0) {
                    sesiones.forEach(sesion => {
                        const dias = cleanDays(sesion.dias_str);
                        const [inicio, fin] = sesion.hora_str.split('-');
                        const hora_inicio = parseTime(inicio);
                        const hora_fin = parseTime(fin);

                        if (dias.length === 0) {
                            sesionesNormalizadas.push({ dia: null, hora_inicio, hora_fin, edificio: sesion.edificio, aula: sesion.aula });
                        } else {
                            dias.forEach(dia => {
                                sesionesNormalizadas.push({ dia, hora_inicio, hora_fin, edificio: sesion.edificio, aula: sesion.aula });
                            });
                        }
                    });
                }

                found = {
                    ...baseInfo,
                    profesor: profesor_asignado,
                    sesiones: sesionesNormalizadas
                };
            }
        });

        return found;
    } catch (error) {
        console.error(`[siiau] Error consultando NRC ${nrc}:`, error.message);
        return null;
    }
}
