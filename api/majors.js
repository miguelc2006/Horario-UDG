import { httpClient } from './_helpers/httpClient.js';
import { load } from 'cheerio';
import iconv from 'iconv-lite';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { cup } = req.query;

    if (!cup) {
        return res.status(400).json({ error: "El parámetro 'cup' es requerido." });
    }

    const MAJORS_URL = `https://siiauescolar.siiau.udg.mx/wal/sspseca.lista_carreras?cup=${cup}`;

    let response;
    try {
        response = await httpClient.get(MAJORS_URL, { 
            headers, 
            timeout: 10000,
            responseType: 'arraybuffer'
        });
    } catch (err) {
        console.error('majors.js error:', err.message);
        return res.status(503).json({ error: 'SIIAU no disponible. Intenta más tarde.' });
    }

    if (!response || response.status !== 200) {
        return res.status(503).json({ error: 'No se pudo conectar al SIIAU' });
    }

    try {
        const html = iconv.decode(response.data, 'iso-8859-1');
        const $ = load(html);

        const table = $('table');
        if (table.length === 0) {
            return res.status(404).json({ error: "No se encontró la tabla de carreras en la página de abreviaturas." });
        }

        const majors = {};
        $('tr').each((i, row) => {
            if (i === 0) return;

            const cells = $(row).find('td');
            if (cells.length >= 2) {
                const key = $(cells[0]).text().trim();
                const value = $(cells[1]).text().trim();
                if (key) {
                    majors[key] = value;
                }
            }
        });

        if (Object.keys(majors).length === 0) {
            return res.status(404).json({ error: "No se encontraron carreras para el centro universitario seleccionado." });
        }

        return res.status(200).json(majors);
    } catch (error) {
        console.error(`Error en /api/majors para cup=${cup}:`, error.message);
        return res.status(500).json({ error: `Ocurrió un error al procesar las carreras: ${error.message}` });
    }
}