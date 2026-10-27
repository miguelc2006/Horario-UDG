import { httpClient } from './_helpers/httpClient.js';
import { load } from 'cheerio';

const BASE_URL = "https://www.misprofesores.com";

// All UdG campus IDs and slugs known on MisProfesores.com
// Verified IDs: 1098 (main, 59+ profs), 3515 (CUCienega), 3514 (CUCSH), 3513 (CUCEA), 3512 (CUCS)
const UDG_SCHOOLS = [
    // Most likely to have the professor — search these first
    { id: 1098,  slug: 'Universidad-de-Guadalajara' },
    { id: 3515,  slug: 'Universidad-de-Guadalajara-CUCienega' },
    { id: 3514,  slug: 'Universidad-de-Guadalajara-CUCSH' },
    { id: 3513,  slug: 'Universidad-de-Guadalajara-CUCEA' },
    { id: 3512,  slug: 'Universidad-de-Guadalajara-CUCS' },
    { id: 2385,  slug: 'Centro-Universitario-de-Ciencias-Exactas-e-Ingenieria-UDG' },
    { id: 7688,  slug: 'Universidad-de-Guadalajara-CUCEI' },
    // Other campuses
    { id: 9062,  slug: 'Universidad-de-Guadalajara-CUAAD' },
    { id: 9063,  slug: 'Universidad-de-Guadalajara-CUCosta' },
    { id: 9064,  slug: 'Universidad-de-Guadalajara-CUValles' },
    { id: 9065,  slug: 'Universidad-de-Guadalajara-CUSur' },
    { id: 9066,  slug: 'Universidad-de-Guadalajara-CUNorte' },
    { id: 9067,  slug: 'Universidad-de-Guadalajara-CUAltos' },
    { id: 9068,  slug: 'Universidad-de-Guadalajara-CUTonala' },
    { id: 9069,  slug: 'Universidad-de-Guadalajara-CULagos' },
];

const HTTP_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'es-MX,es;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
};

const REQUEST_TIMEOUT = 15000; // 15 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const CACHE_MAX_SIZE = 100; // Maximum number of cached entries

/**
 * Simple in-memory cache for API responses
 */
const cache = new Map();

/**
 * Validates and sanitizes professor data
 */
const validateProfessorData = (data) => {
    const sanitized = {
        id: String(data.id || ''),
        name: String(data.name || '').trim(),
        ratingMP: Math.max(0, Math.min(10, parseFloat(data.ratingMP) || 0)),
        difficultyMP: Math.max(0, Math.min(10, parseFloat(data.difficultyMP) || 0)),
        recommendationMP: String(data.recommendationMP || ''),
        numRatings: Math.max(0, parseInt(data.numRatings) || 0),
        department: String(data.department || '').trim(),
        school: String(data.school || '').trim(),
        urlMP: String(data.urlMP || '').trim(),
        source: String(data.source || 'MisProfesores.com').trim(),
        comments: [],
    };
    
    // Validate URL format
    if (sanitized.urlMP && !sanitized.urlMP.startsWith('http')) {
        sanitized.urlMP = '';
    }
    
    // Sanitize name (remove any potential XSS characters)
    sanitized.name = sanitized.name
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    
    // Validate and sanitize comments (now cleaner from improved scraper)
    if (Array.isArray(data.comments)) {
        sanitized.comments = data.comments
            .filter(comment => comment && typeof comment === 'object')
            .map(comment => {
                let text = String(comment.text || '').trim();
                
                // Additional cleanup in validation (belt and suspenders)
                text = text
                    .replace(/\d+\s*personas que les pareció útil/gi, '')
                    .replace(/\d+\s*personas que no les pareció útil/gi, '')
                    .replace(/reportar esta calificación/gi, '')
                    .replace(/\bidle$/g, '')
                    .trim();
                
                // Process tags if present
                let tags = null;
                if (Array.isArray(comment.tags) && comment.tags.length > 0) {
                    tags = comment.tags
                        .map(t => String(t).trim())
                        .filter(t => t.length > 0 && t.length < 50)
                        .slice(0, 10);
                    if (tags.length === 0) tags = null;
                }
                
                return {
                    text: text
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#x27;')
                        .slice(0, 1000),
                    tags: tags,
                    score: (comment.score && String(comment.score).trim()) || null,
                    date: (comment.date && String(comment.date).trim()) || null,
                };
            })
            .filter(comment => (comment.text && comment.text.trim()) || comment.tags) // Accept all with content or tags
            .slice(0, 20); // Limit to 20 comments
    }
    
    return sanitized;
};

/**
 * Extracts and validates comments from HTML using correct selectors
 * Based on actual MisProfesores.com HTML structure:
 * - Each review is in a <tr> inside <table class="tftable">
 * - Main comment: <p class="commentsParagraph">
 * - Tags: <div class="tagbox"> with <span> tags
 * - Score: <span class="score"> inside <div class="descriptor-container">
 */
const extractComments = ($) => {
    const comments = [];
    
    // Find all table rows in the ratings table
    $('table.tftable tr').each((rowIndex, row) => {
        const $row = $(row);
        
        // Skip header rows
        if ($row.find('th').length > 0) return;
        
        // Extract the comments cell
        const $commentsCell = $row.find('td.comments');
        if ($commentsCell.length === 0) return;
        
        // 1. Extract main comment text from commentsParagraph
        let commentText = '';
        const $paragraph = $commentsCell.find('p.commentsParagraph');
        if ($paragraph.length > 0) {
            commentText = $paragraph.text().trim();
        }
        
        // 2. Extract tagbox content as separate field
        let tags = [];
        const $tagbox = $commentsCell.find('div.tagbox');
        if ($tagbox.length > 0) {
            $tagbox.find('span').each((i, el) => {
                const tag = $(el).text().trim();
                if (tag) tags.push(tag);
            });
        }
        
        // 3. Extract score from the rating block
        let score = null;
        const $scoreSpan = $row.find('td.rating span.score').first();
        if ($scoreSpan.length > 0) {
            const scoreText = $scoreSpan.text().trim();
            const scoreNum = parseFloat(scoreText);
            if (!isNaN(scoreNum)) {
                score = scoreNum + '/10';
            }
        }
        
        // 4. Extract date for potential use
        let date = null;
        const $dateDiv = $row.find('td.rating div.date');
        if ($dateDiv.length > 0) {
            date = $dateDiv.text().trim();
        }
        
        // Clean up unwanted patterns from text
        let cleanedText = commentText
            .replace(/\s+/g, ' ')
            .trim();
        
        // Skip if completely empty and no tags
        if (!cleanedText && tags.length === 0) return;
        
        // Use placeholder for tag-only comments
        if (!cleanedText) cleanedText = ' ';
        cleanedText = cleanedText
            .replace(/\d+\s+personas que les pareció útil\s*/gi, '')
            .replace(/\d+\s+personas que no les pareció útil\s*/gi, '')
            .replace(/^personas que les pareció útil\s*/gi, '')
            .replace(/^personas que no les pareció útil\s*/gi, '')
            .replace(/reportar esta calificación\s*/gi, '')
            .replace(/^\s*personas\s*/gi, '')
            .trim();
        
        // Accept all comments (even short ones) if they have text OR tags
        if (!cleanedText && tags.length === 0) return; // Only skip if completely empty
        
        // Sanitize for XSS
        const sanitizedText = cleanedText
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
        
        // Sanitize tags
        const sanitizedTags = tags.map(tag => 
            tag.replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#x27;')
        );
        
        comments.push({ 
            text: sanitizedText, 
            tags: sanitizedTags.length > 0 ? sanitizedTags : null,
            score: score,
            date: date
        });
    });
    
    return comments.slice(0, 20);
};

/**
 * Get cached data if available and not expired
 */
const getCachedData = (key) => {
    const cached = cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > CACHE_TTL) {
        cache.delete(key);
        return null;
    }
    
    console.log(`[Cache] Cache hit para: ${key}`);
    return cached.data;
};

/**
 * Store data in cache with timestamp
 */
const setCachedData = (key, data) => {
    // Clean up old entries if cache is too large
    if (cache.size >= CACHE_MAX_SIZE) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
    }
    
    cache.set(key, {
        data,
        timestamp: Date.now()
    });
    
    console.log(`[Cache] Datos guardados en cache: ${key}`);
};

/**
 * Clear expired cache entries
 */
const cleanupCache = () => {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            cache.delete(key);
        }
    }
};

// Clean cache every 5 minutes
setInterval(cleanupCache, 5 * 60 * 1000);

/**
 * Makes an HTTP request with retry logic and better error handling
 */
const makeRequestWithRetry = async (url, options = {}, retries = MAX_RETRIES) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`[Scraper] Intento ${attempt}/${retries} para: ${url}`);
            
            const response = await httpClient.get(url, {
                ...options,
                timeout: REQUEST_TIMEOUT,
                headers: { ...HTTP_HEADERS, ...options.headers },
            });
            
            return response;
            
        } catch (error) {
            const isLastAttempt = attempt === retries;
            const errorType = error.code || error.message;
            
            console.warn(`[Scraper] Error en intento ${attempt}: ${errorType}`);
            
            if (isLastAttempt) {
                throw error;
            }
            
            // Don't retry on certain errors (4xx client errors)
            if (error.response && error.response.status >= 400 && error.response.status < 500) {
                throw error;
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        }
    }
};

/**
 * Normalizes a string: lowercase, remove accents, ñ -> n, strip non-alphanumeric
 * Handles common name variations and academic titles
 */
const normalize = (text) => {
    if (!text) return '';
    
    // Remove academic titles and common prefixes
    let cleaned = text
        .replace(/\b(DR|DRA|MTRO|MTRA|LIC|ING|PHD|PROF|C.\s*P\.)\.?\s*/gi, '')
        .replace(/\b(DOCTOR|DOCTORA|MAESTRO|MAESTRA|LICENCIADO|INGENIERO|PROFESOR|PROFESORA)\b\s*/gi, '')
        .replace(/\b(C\.\s*P\.\s*)/gi, '') // C.P. (Contador Público)
        .trim();
    
    return cleaned
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ñ/g, 'n')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Calculate similarity score between two names using multiple strategies
 * Returns a score between 0 and 1
 */
const matchScore = (searchName, dbName) => {
    if (!searchName || !dbName) return 0;
    
    const searchWords = searchName.split(' ').filter(w => w.length > 1);
    const dbWords = dbName.split(' ').filter(w => w.length > 1);
    
    if (searchWords.length === 0 || dbWords.length === 0) return 0;
    
    // Strategy 1: Exact substring match (highest weight)
    if (searchName.includes(dbName) || dbName.includes(searchName)) {
        return 1.0;
    }
    
    // Strategy 2: Word-by-word matching with position weighting
    let positionMatches = 0;
    let totalWeight = 0;
    
    for (let i = 0; i < searchWords.length; i++) {
        const searchWord = searchWords[i];
        const weight = 1.0 / (i + 1); // First words have higher weight
        totalWeight += weight;
        
        for (let j = 0; j < dbWords.length; j++) {
            const dbWord = dbWords[j];
            const wordScore = calculateWordSimilarity(searchWord, dbWord);
            if (wordScore >= 0.8) { // High similarity threshold
                positionMatches += weight * wordScore;
                break;
            }
        }
    }
    
    const positionalScore = totalWeight > 0 ? positionMatches / totalWeight : 0;
    
    // Strategy 3: Jaccard similarity of word sets
    const searchSet = new Set(searchWords);
    const dbSet = new Set(dbWords);
    const intersection = [...searchSet].filter(x => dbSet.has(x));
    const union = new Set([...searchSet, ...dbSet]);
    const jaccardScore = union.size > 0 ? intersection.length / union.size : 0;
    
    // Strategy 4: Levenshtein distance ratio
    const levenshteinScore = 1 - (levenshteinDistance(searchName, dbName) / Math.max(searchName.length, dbName.length));
    
    // Combine scores with weights
    const combinedScore = (
        positionalScore * 0.5 + 
        jaccardScore * 0.3 + 
        levenshteinScore * 0.2
    );
    
    return Math.min(1, combinedScore);
};

/**
 * Calculate similarity between two words using various metrics
 */
const calculateWordSimilarity = (word1, word2) => {
    if (word1 === word2) return 1.0;
    if (word1.length < 2 || word2.length < 2) return 0;
    
    // Check if one contains the other
    if (word1.includes(word2) || word2.includes(word1)) {
        return 0.9;
    }
    
    // Calculate Levenshtein distance ratio
    const distance = levenshteinDistance(word1, word2);
    const maxLen = Math.max(word1.length, word2.length);
    return 1 - (distance / maxLen);
};

/**
 * Calculate Levenshtein distance between two strings
 */
const levenshteinDistance = (str1, str2) => {
    const m = str1.length;
    const n = str2.length;
    
    // Create a 2D matrix
    const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
    
    // Initialize first row and column
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    // Fill the matrix
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i - 1][j],     // deletion
                    dp[i][j - 1],     // insertion
                    dp[i - 1][j - 1]  // substitution
                );
            }
        }
    }
    
    return dp[m][n];
};

/**
 * Fetch school page and extract the dataSet variable
 * dataSet format: [{i: profId, n: firstName, a: lastName, d: department, m: numRatings, c: avgScore}]
 */
const fetchSchoolDataSet = async (school) => {
    const url = `${BASE_URL}/escuelas/${school.slug}_${school.id}`;
    const cacheKey = `school_${school.id}`;
    
    // Check cache first
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
        return cachedData;
    }
    
    console.log(`[Scraper] Cargando escuela: ${url}`);
    
    try {
        const response = await makeRequestWithRetry(url);
        const html = response.data;
        
        // Multiple regex patterns to handle different dataSet formats
        const patterns = [
            /var\s+dataSet\s*=\s*(\[[\s\S]*?\]);/,
            /dataSet\s*=\s*(\[[\s\S]*?\]);/,
            /"dataSet"\s*:\s*(\[[\s\S]*?\])/
        ];
        
        let dataSet = null;
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                try {
                    dataSet = JSON.parse(match[1]);
                    console.log(`[Scraper]  → ${dataSet.length} profesores encontrados`);
                    
                    // Cache the result
                    setCachedData(cacheKey, dataSet);
                    
                    break;
                } catch (parseError) {
                    console.warn(`[Scraper]  → Error al parsear dataSet con patrón ${pattern}: ${parseError.message}`);
                    continue;
                }
            }
        }
        
        if (!dataSet) {
            console.log(`[Scraper]  → No se encontró dataSet (posiblemente usa server-side)`);
        }
        
        return dataSet;
        
    } catch (error) {
        const errorMsg = error.response ? `HTTP ${error.response.status}` : error.message;
        console.warn(`[Scraper]  → Error al cargar escuela ${school.slug}: ${errorMsg}`);
        return null;
    }
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Falta el nombre del profesor.' });

    try {
        // Clean the name: strip academic titles
        const cleanName = name
            .replace(/\b(DR|MTRO|LIC|DRA|MTRA|ING|PHD)\.?\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        const normalizedSearch = normalize(cleanName);
        console.log(`[Scraper] Buscando: "${cleanName}" (normalizado: "${normalizedSearch}")`);

        let bestMatch = null;
        let bestScore = 0;
        let bestSchool = null;

        for (const school of UDG_SCHOOLS) {
            let dataSet;
            try {
                dataSet = await fetchSchoolDataSet(school);
            } catch (err) {
                console.warn(`[Scraper]  → Error en ${school.slug}: ${err.message}`);
                continue;
            }

            if (!dataSet || dataSet.length === 0) continue;

            for (const prof of dataSet) {
                // dataSet record: { i:id, n:firstName, a:lastName, d:dept, m:numRatings, c:avgScore }
                // Parse the 'i' field - it may be a JSON string containing {i, n, a, d, m, c}
                let profData = prof;
                if (typeof prof === 'string') {
                    try { profData = JSON.parse(prof); } catch { continue; }
                }
                
                const firstName = normalize(profData.n || '');
                const lastName = normalize(profData.a || '');
                const fullName = `${firstName} ${lastName}`.trim();
                const fullNameAlt = `${lastName} ${firstName}`.trim();

                const score1 = matchScore(normalizedSearch, fullName);
                const score2 = matchScore(normalizedSearch, fullNameAlt);
                const score = Math.max(score1, score2);

                if (score > bestScore || (score >= 0.7 && !bestMatch)) {
                    bestScore = score;
                    bestMatch = profData;
                    bestSchool = school;
                    console.log(`[Scraper]  → Candidato: "${profData.n} ${profData.a}" (score: ${(score*100).toFixed(0)}%)`);
                }
            }

            // If we found a very good match, stop early
            if (bestScore >= 0.9) {
                console.log(`[Scraper] Match excelente encontrado, deteniendo búsqueda`);
                break;
            }
        }

        if (!bestMatch || bestScore < 0.6) {
            console.warn(`[Scraper] No se encontró ningún match (mejor score: ${(bestScore*100).toFixed(0)}%)`);
            return res.status(404).json({
                error: 'De momento no se encontraron evaluaciones externas para este profesor.',
                debug: { searched: cleanName, bestScore: (bestScore * 100).toFixed(0) + '%' }
            });
        }

        console.log(`[Scraper] ¡MATCH FINAL! "${bestMatch.n} ${bestMatch.a}" en ${bestSchool.slug} (score: ${(bestScore*100).toFixed(0)}%)`);

        // Build professor profile URL: https://www.misprofesores.com/profesores/Nombre-Apellido_ID
        const profId = bestMatch.i;
        
        // Build slug from name (same format MisProfesores uses)
        const buildSlug = (n, a) => {
            const slugify = (str) => str
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
                .replace(/[^a-zA-Z0-9\s]/g, '')
                .trim().split(/\s+/).join('-');
            return `${slugify(n)}-${slugify(a)}`;
        };
        
        const profSlug = buildSlug(bestMatch.n || '', bestMatch.a || '');
        const profUrl = `${BASE_URL}/profesores/${profSlug}_${profId}`;

        
        // Fetch the actual profile page to get detailed stats
        console.log(`[Scraper] Obteniendo perfil: ${profUrl}`);
        let rating = 0;
        let difficulty = 0;
        let recommendation = '';
        let comments = [];
        let finalUrl = profUrl;

        try {
            const profileResponse = await makeRequestWithRetry(profUrl, {
                maxRedirects: 5,
            });
            const html = profileResponse.data;
            const $p = load(html);
            
            // .grade elements: [0]=overall rating, [1]=recommendation %, [2]=difficulty, [3+]=individual reviews
            const gradeValues = [];
            $p('.grade').each((i, el) => gradeValues.push($p(el).text().trim()));
            
            console.log(`[Scraper] .grade values:`, gradeValues.slice(0, 5));
            
            if (gradeValues[0]) rating = parseFloat(gradeValues[0]) || 0;
            if (gradeValues[1]) recommendation = gradeValues[1]; // e.g. "100%"
            if (gradeValues[2]) difficulty = parseFloat(gradeValues[2]) || 0;

            // Extract individual reviews with the new improved function
            const extractedComments = extractComments($p);
            comments = extractedComments;

            // Get canonical URL
            const canonMatch = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/);
            if (canonMatch) finalUrl = canonMatch[1];
            else if (profileResponse.request?.res?.responseUrl) finalUrl = profileResponse.request.res.responseUrl;

            console.log(`[Scraper] Perfil cargado: rating=${rating}, rec=${recommendation}, diff=${difficulty}, comentarios=${comments.length}`);

        } catch (profileErr) {
            console.warn(`[Scraper] Error al cargar perfil: ${profileErr.message}`);
            // Continuamos con los datos del dataSet aunque no podamos obtener el perfil detallado
        }


        const rawData = {
            id: String(profId),
            name: `${bestMatch.n} ${bestMatch.a}`,
            // Use scraped rating from profile page, fall back to the average saved in dataSet
            ratingMP: rating || parseFloat(bestMatch.c) || 0,
            difficultyMP: difficulty || 0,
            recommendationMP: recommendation,
            numRatings: parseInt(bestMatch.m) || 0,
            department: bestMatch.d || '',
            school: bestSchool.slug
                .replace('Centro-Universitario-de-Ciencias-Exactas-e-Ingenieria-UDG', 'UdG CUCEI')
                .replace('Universidad-de-Guadalajara-', 'UdG ')
                .replace('Universidad-de-Guadalajara', 'UdG'),
            urlMP: finalUrl,
            source: 'MisProfesores.com',
            comments: comments.slice(0, 20), // Include up to 20 comments
        };

        // Validate and sanitize the data
        const data = validateProfessorData(rawData);

        return res.status(200).json(data);

    } catch (error) {
        console.error('[Scraper] Error general:', error.message);
        return res.status(500).json({ error: 'Ocurrió un error al consultar las evaluaciones.' });
    }
}
