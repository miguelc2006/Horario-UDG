import { httpClient } from './_helpers/httpClient.js';
import { load } from 'cheerio';
import iconv from 'iconv-lite';

const FORM_URL = "https://siiauescolar.siiau.udg.mx/wal/sspseca.forma_consulta";

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    let response;
    try {
        response = await httpClient.get(FORM_URL, { 
            headers, 
            timeout: 10000,
            responseType: 'arraybuffer'
        });
    } catch (err) {
        console.error('form-options.js error:', err.message);
        return res.status(503).json({ error: 'SIIAU no disponible. Intenta más tarde.' });
    }

    if (!response || response.status !== 200) {
        return res.status(503).json({ error: 'No se pudo conectar al SIIAU' });
    }

    try {
        const html = iconv.decode(response.data, 'iso-8859-1');
        const $ = load(html);

        const optionsData = {};
        const importantFields = ["ciclop", "cup"];

        importantFields.forEach(fieldName => {
            const selectTag = $(`select[name="${fieldName}"]`);
            if (selectTag.length) {
                const options = [];
                selectTag.find("option").each((i, option) => {
                    const value = $(option).attr("value")?.trim();
                    if (value) {
                        const fullText = $(option).text().trim().replace(/\s+/g, ' ');
                        const parts = fullText.split("-");
                        const description = parts.length > 1 ? parts.slice(1).join('-').trim() : fullText;
                        options.push({ value, description });
                    }
                });
                optionsData[fieldName] = options;
            }
        });

        if (Object.keys(optionsData).length === 0 || !optionsData.ciclop || !optionsData.cup) {
            return res.status(404).json({ error: "No se pudieron encontrar los campos del formulario en la página del SIIAU." });
        }

        return res.status(200).json(optionsData);
    } catch (error) {
        console.error("Error en /api/form-options:", error.message);
        return res.status(500).json({ error: `Falló la obtención de opciones del formulario: ${error.message}` });
    }
}