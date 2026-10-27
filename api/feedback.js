// api/feedback.js
import { httpClient } from './_helpers/httpClient.js';

// ID del Google Form (configurado en Vercel Environment Variables)
// En Vercel: VITE_GOOGLE_FORM_ID
// En desarrollo local: se usa este fallback
const GOOGLE_FORM_ID = '1FAIpQLSc2OVHto4z6xPdNfErB_57OSIawL0S_VfyO4pHg0202Mw0vlA';

// Entry IDs del formulario
const ENTRY_IDS = {
    type: 'entry.1713267081',
    message: 'entry.1088712833',
    email: 'entry.1085045833',
    timestamp: 'entry.1840411743'
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { type, message, email, timestamp } = req.body;

    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'El mensaje es requerido' });
    }

    console.log('===== NUEVO FEEDBACK =====');
    console.log('Tipo:', type);
    console.log('Mensaje:', message);
    console.log('Email:', email || 'no proporcionado');
    console.log('Fecha:', timestamp);
    console.log('Google Form ID:', GOOGLE_FORM_ID ? 'CONFIGURADO' : 'NO CONFIGURADO');

    // Enviar a Google Forms
    try {
        const params = new URLSearchParams();
        params.append(ENTRY_IDS.type, type || 'reporte');
        params.append(ENTRY_IDS.message, message);
        params.append(ENTRY_IDS.email, email || '');
        params.append(ENTRY_IDS.timestamp, timestamp || new Date().toISOString());

        const googleFormUrl = `https://docs.google.com/forms/d/e/${GOOGLE_FORM_ID}/formResponse`;
        
        const response = await httpClient.post(googleFormUrl, params.toString(), {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 8000,
            maxRedirects: 0
        });
        
        console.log('✅ Enviado a Google Forms:', response.status);
        
    } catch (googleError) {
        console.log('⚠️ Error Google Forms:', googleError.message);
    }

    return res.status(200).json({ 
        success: true, 
        message: 'Feedback recibido correctamente' 
    });
}