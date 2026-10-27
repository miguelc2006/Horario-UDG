// src/components/GenerarHorario.jsx
import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { detectarCruces } from '../services/scheduleUtils';
import './GenerarHorario.css';

const timeToMinutes = (timeStr) => {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// 1. CLASE CARD CON BOTÓN DE ELIMINAR
const ClaseCard = ({ clase, tieneCruce, onRemove, isTapped, onTap, isDayMode }) => {
    const dayToColumn = {
        'Lunes': 2, 'Martes': 3, 'Miércoles': 4, 'Jueves': 5, 'Viernes': 6, 'Sábado': 7,
    };
    
    const startMinutes = timeToMinutes(clase.hora_inicio);
    const endMinutes = timeToMinutes(clase.hora_fin);
    const startRow = Math.floor((startMinutes - 420) / 60) + 2; 
    const durationInRows = Math.ceil((endMinutes - startMinutes) / 60);
    const endRow = startRow + durationInRows;

    // En modo día, todas las tarjetas van a la columna 2 (único día)
    const col = isDayMode ? 2 : (dayToColumn[clase.dia] || 2);
    
    const cardClassName = `clase-card-inner ${tieneCruce ? 'cruce-horario' : ''} ${isTapped ? 'card-tapped' : ''}`;

    return (
        <div className={`clase-card ${isTapped ? 'tapped' : ''}`} style={{ 
            gridColumn: col, 
            gridRow: `${startRow} / ${endRow}`, 
            pointerEvents: 'auto',
            width: '96%',
            marginLeft: '2%',
            zIndex: isTapped ? 100 : 10
        }}
        onClick={() => { onTap?.(clase.nrc, clase.dia); }}
        >
            <div className={cardClassName}>
                {/* Botón de eliminar */}
                <button 
                    className="card-remove-btn" 
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove(clase.nrc);
                    }}
                    title="Quitar materia"
                >
                    ×
                </button>

                <strong>{clase.materia}</strong>
                <span className="clase-location">{clase.edificio} - {clase.aula}</span>
                <span className="clase-prof">{clase.profesor}</span>
            </div>
        </div>
    );
};

// ... (El componente HorarioImagen se queda IGUAL, no lo toques) ...
// ... (Aquí iría el código de HorarioImagen que ya tienes) ...
const HorarioImagen = React.forwardRef(({ clases, calendarioLabel, aspectRatio, theme }, ref) => {
    // ... Tu código existente de HorarioImagen ...
    // (Resumido para no repetir todo el bloque, asegúrate de mantenerlo)
    const isVertical = aspectRatio === '9/16';
    const isLightTheme = theme === 'light';
    const lightPalette = ['#a2d2ff', '#ffb3c1', '#bde0fe', '#ffafcc', '#cdb4db', '#ffc8dd', '#d4e09b'];
    const darkPalette = ['#2980b9', '#c0392b', '#16a085', '#8e44ad', '#f39c12', '#2c3e50', '#d35400'];
    const colorPalette = isLightTheme ? lightPalette : darkPalette;

    const subjectColors = {};
    let colorIndex = 0;
    clases.forEach(clase => {
        if (!subjectColors[clase.clave]) {
            subjectColors[clase.clave] = colorPalette[colorIndex % colorPalette.length];
            colorIndex++;
        }
    });

    const hasSaturdayClasses = clases.some(c => c.dia === 'Sábado');
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', hasSaturdayClasses ? 'Sábado' : null].filter(Boolean);

    let minHour = 22, maxHour = 7;
    if (clases.length > 0) {
        clases.forEach(clase => {
            if (clase.hora_inicio && clase.hora_fin) {
                minHour = Math.min(minHour, Math.floor(timeToMinutes(clase.hora_inicio) / 60));
                maxHour = Math.max(maxHour, Math.ceil(timeToMinutes(clase.hora_fin) / 60));
            }
        });
    } else {
        minHour = 7; maxHour = 15;
    }

    const hours = Array.from({ length: maxHour - minHour }, (_, i) => i + minHour);
    
    const styles = {
        container: { background: isLightTheme ? '#f8f9fa' : '#212529', color: isLightTheme ? '#212529' : '#ffffff' },
        headerH2: { color: isLightTheme ? '#212529' : '#ffffff' },
        headerP: { color: isLightTheme ? '#6c757d' : '#aaa' },
        gridLabels: { color: isLightTheme ? '#6c757d' : '#aaa' },
        classText: { color: isLightTheme ? '#000000' : '#ffffff' }
    };

    return (
        <div ref={ref} className="horario-wallpaper-container" style={{ ...styles.container, aspectRatio }}>
             <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                .horario-wallpaper-container {
                    font-family: 'Inter', sans-serif;
                    padding: ${isVertical ? '50px 25px' : '40px'};
                    box-sizing: border-box; display: flex; flex-direction: column;
                    width: 100%; height: 100%;
                }
                .wallpaper-header { text-align: center; margin-bottom: ${isVertical ? '25px' : '20px'}; }
                .wallpaper-header h2 { font-size: ${isVertical ? '32px' : '28px'}; margin: 0 0 8px 0; }
                .wallpaper-header p { font-size: ${isVertical ? '18px' : '16px'}; margin: 0; }
                .wallpaper-grid {
                    display: grid;
                    grid-template-columns: ${isVertical ? '50px' : '55px'} repeat(${days.length}, 1fr);
                    grid-template-rows: ${isVertical ? '35px' : '30px'} repeat(${hours.length}, 1fr);
                    gap: ${isVertical ? '8px' : '8px'};
                    flex-grow: 1;
                }
                .wallpaper-day, .wallpaper-time {
                    font-size: ${isVertical ? '14px' : '12px'}; font-weight: 600; 
                    display: flex; align-items: center; justify-content: center;
                }
                .wallpaper-time { justify-content: flex-end; padding-right: 10px; }
                .wallpaper-clase {
                    padding: ${isVertical ? '10px' : '8px'}; border-radius: ${isVertical ? '8px' : '6px'};
                    box-sizing: border-box; display: flex; flex-direction: column;
                    justify-content: center; text-align: center;
                }
                .wallpaper-clase strong { font-size: ${isVertical ? '15px' : '13px'}; font-weight: 700; margin-bottom: 4px; }
                .wallpaper-clase span { font-size: ${isVertical ? '13px' : '11px'}; opacity: 0.9; }
                `}
            </style>
             <div className="wallpaper-header">
                <h2 style={styles.headerH2}>Mi Horario</h2>
                <p style={styles.headerP}>{calendarioLabel}</p>
            </div>
            <div className="wallpaper-grid">
                {days.map((day, i) => (
                    <div key={day} className="wallpaper-day" style={{ ...styles.gridLabels, gridColumn: i + 2, gridRow: 1 }}>{day.substring(0,3)}</div>
                ))}
                {hours.map((hour, i) => (
                    <div key={hour} className="wallpaper-time" style={{ ...styles.gridLabels, gridColumn: 1, gridRow: i + 2 }}>{`${hour}:00`}</div>
                ))}
                {clases.map((clase, index) => {
                    if (!clase.hora_inicio || days.indexOf(clase.dia) === -1) return null;
                    const startMin = timeToMinutes(clase.hora_inicio);
                    const endMin = timeToMinutes(clase.hora_fin);
                    const startRow = Math.floor(startMin / 60) - minHour + 2;
                    const endRow = Math.ceil(endMin / 60) - minHour + 2;
                    const dayCol = days.indexOf(clase.dia) + 2;
                    return (
                        <div key={index} className="wallpaper-clase" style={{
                            gridColumn: dayCol, gridRow: `${startRow} / ${endRow}`,
                            backgroundColor: subjectColors[clase.clave], color: styles.classText.color,
                        }}>
                            <strong>{clase.materia}</strong>
                            <span>{clase.profesor}</span>
                            <span>{clase.edificio}-{clase.aula}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
HorarioImagen.displayName = 'HorarioImagen';


// 2. COMPONENTE PRINCIPAL ACTUALIZADO
// Recibimos 'onRemoveClase' como nueva prop
export function GenerarHorario({ clasesSeleccionadas, calendarioLabel, theme, onRemoveClase }) {
    const scheduleRef = useRef(null);
    const imageRenderRef = useRef(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [aspectRatio, setAspectRatio] = useState('9/16');
    const [imageTheme, setImageTheme] = useState(theme);
    const [isRendering, setIsRendering] = useState(false);
    const horas = Array.from({ length: 15 }, (_, i) => `${(i + 7).toString().padStart(2, '0')}:00`);
    const [renderSize, setRenderSize] = useState({ width: 1080, height: 1920 });

    // --- Mobile: día seleccionado (null = vista semanal completa) ---
    const [activeDay, setActiveDay] = useState(null);
    // --- Mobile: tarjetas expandidas al tocar ---
    const [tappedNrcs, setTappedNrcs] = useState(new Set());

    // Días que tienen clases (para el filtro móvil)
    const activeDays = useMemo(() => {
        const order = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const days = [...new Set(clasesSeleccionadas.filter(c => c.dia).map(c => c.dia))];
        return days.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }, [clasesSeleccionadas]);

    // Clases filtradas por día seleccionado (móvil)
    const filteredClases = useMemo(() => {
        if (!activeDay) return clasesSeleccionadas;
        return clasesSeleccionadas.filter(c => c.dia === activeDay);
    }, [clasesSeleccionadas, activeDay]);

    // Alternar expansión al tocar en móvil
    const toggleTap = useCallback((nrc, dia) => {
        const key = `${nrc}-${dia}`;
        setTappedNrcs(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }, []);

    const nrcsConCruce = useMemo(() => {
        const cruces = detectarCruces(clasesSeleccionadas);
        const nrcs = new Set();
        cruces.forEach(([clase1, clase2]) => { 
            nrcs.add(clase1.nrc); 
            nrcs.add(clase2.nrc); 
        });
        return nrcs;
    }, [clasesSeleccionadas]);

    // Descarga PDF con lazy loading de jsPDF + autotable
    const handleDownloadPdf = useCallback(async () => {
        // Import dinámico: estas librerías solo se cargan cuando el usuario hace clic
        const [jsPDFModule, autoTableModule] = await Promise.all([
            import('jspdf'),
            import('jspdf-autotable')
        ]);
        const jsPDF = jsPDFModule.default;
        const autoTable = autoTableModule.default || autoTableModule;

        let minHour = 22, maxHour = 7;
        if (clasesSeleccionadas.length > 0) { 
            clasesSeleccionadas.forEach(c => { 
                if (c.hora_inicio) minHour = Math.min(minHour, Math.floor(timeToMinutes(c.hora_inicio) / 60)); 
                if (c.hora_fin) maxHour = Math.max(maxHour, Math.ceil(timeToMinutes(c.hora_fin) / 60)); 
            }); 
        } else { minHour = 7; maxHour = 15; }
        
        const subjectColors = {}, colorPalette = [[225, 245, 254], [255, 229, 228], [222, 247, 221], [255, 244, 222], [237, 230, 249]];
        let colorIndex = 0; 
        clasesSeleccionadas.forEach(c => { if (!subjectColors[c.clave]) subjectColors[c.clave] = colorPalette[colorIndex++ % colorPalette.length]; });
        
        const hasSaturday = clasesSeleccionadas.some(c => c.dia === 'Sábado');
        const activeDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].concat(hasSaturday ? ['Sábado'] : []);
        const head = [['Hora', ...activeDays]], body = [], grid = Array.from({ length: maxHour - minHour }, () => Array(activeDays.length).fill(''));
        
        clasesSeleccionadas.forEach(clase => {
            const dayIndex = activeDays.indexOf(clase.dia); 
            if (dayIndex === -1 || !clase.hora_inicio) return;
            const startRow = Math.floor(timeToMinutes(clase.hora_inicio) / 60) - minHour;
            const duration = Math.ceil((timeToMinutes(clase.hora_fin) - timeToMinutes(clase.hora_inicio)) / 60);
            if (startRow >= 0 && startRow < grid.length) {
                grid[startRow][dayIndex] = { 
                    content: `${clase.materia}\n${clase.edificio} - ${clase.aula}\n${clase.profesor}`, 
                    rowSpan: duration, 
                    styles: { fillColor: subjectColors[clase.clave], textColor: [40, 40, 40] } 
                };
                for (let i = 1; i < duration; i++) if (startRow + i < grid.length) grid[startRow + i][dayIndex] = null;
            }
        });
        
        for (let i = 0; i < maxHour - minHour; i++) {
            const hour = minHour + i, row = [`${hour}:00\nA ${hour + 1}:00`]; 
            for (let j = 0; j < activeDays.length; j++) if (grid[i][j] !== null) row.push(grid[i][j]); 
            body.push(row);
        }
        
        const tempDoc = new jsPDF(); autoTable(tempDoc, { head, body });
        const doc = new jsPDF((tempDoc.lastAutoTable.finalY - tempDoc.lastAutoTable.startY + 45 > tempDoc.internal.pageSize.getHeight() / 2 && hasSaturday) ? 'l' : 'p', 'mm', 'letter');
        
        doc.setFontSize(16).setFont('helvetica', 'bold').text("Universidad de Guadalajara", doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
        doc.setFontSize(12).setFont('helvetica', 'normal').text(calendarioLabel || "Ciclo Escolar", doc.internal.pageSize.getWidth() / 2, 28, { align: 'center' });
        
        autoTable(doc, { 
            head, body, startY: 35, theme: 'grid', 
            styles: { fontSize: 7, valign: 'middle', lineWidth: 0.1, lineColor: [200, 200, 200] }, 
            headStyles: { fillColor: [41, 128, 185], textColor: 255 }, 
            columnStyles: { 0: { cellWidth: 18 } } 
        });
        
        doc.setFontSize(8).text(`Generado el ${new Date().toLocaleDateString('es-MX')} en horarioudg.vercel.app`, doc.internal.pageSize.getWidth() / 2, doc.lastAutoTable.finalY + 10, { align: 'center' });
        doc.save('horario.pdf');
    }, [clasesSeleccionadas, calendarioLabel]);

    const handleGenerateImage = useCallback(() => { 
        setIsModalOpen(false); 
        setIsRendering(true); 
        const isVertical = aspectRatio === '9/16'; 
        setRenderSize({ width: isVertical ? 1080 : 1920, height: isVertical ? 1920 : 1080 }); 
    }, [aspectRatio]);

    useEffect(() => {
        if (isRendering) {
            let cancelled = false;
            const generate = async () => {
                // Import dinámico: html2canvas solo se carga al generar imagen
                const html2canvasModule = await import('html2canvas');
                const html2canvas = html2canvasModule.default;
                
                const elementToRender = imageRenderRef.current;
                if (elementToRender && !cancelled) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    if (cancelled) return;
                    const canvas = await html2canvas(elementToRender, { width: renderSize.width, height: renderSize.height, scale: 1, useCORS: true, logging: false });
                    const link = document.createElement('a'); link.href = canvas.toDataURL('image/jpeg', 0.95); link.download = `horario-${aspectRatio === '9/16' ? 'telefono' : 'escritorio'}-${imageTheme}.jpeg`; link.click();
                }
                if (!cancelled) setIsRendering(false);
            };
            generate();
            return () => { cancelled = true; };
        }
    }, [isRendering, renderSize, aspectRatio, imageTheme]);

    const isDayMode = activeDay !== null;
    const displayClases = isDayMode ? filteredClases : clasesSeleccionadas;

    return (
        <div className="card">
            {/* Selector de días para móvil */}
            {activeDays.length > 1 && (
                <div className="mobile-day-tabs">
                    <button
                        className={`day-tab ${!activeDay ? 'active' : ''}`}
                        onClick={() => { setActiveDay(null); setTappedNrcs(new Set()); }}
                    >
                        📅 Semana
                    </button>
                    {activeDays.map(day => (
                        <button
                            key={day}
                            className={`day-tab ${activeDay === day ? 'active' : ''}`}
                            onClick={() => { setActiveDay(day); setTappedNrcs(new Set()); }}
                        >
                            {day.substring(0, 3)}
                        </button>
                    ))}
                </div>
            )}

            <div ref={scheduleRef} className={`schedule-container ${isDayMode ? 'day-mode' : ''}`}>
                {isDayMode ? (
                    /* --- MODO DÍA: grid de 2 columnas (Hora + Día activo) --- */
                    <div className="horario-grid day-grid">
                        <div className="grid-header">Hora</div>
                        <div className="grid-header">{activeDay}</div>
                        {horas.map(hora => (
                            <React.Fragment key={hora}>
                                <div className="time-slot">{hora}</div>
                                <div className="grid-cell"></div>
                            </React.Fragment>
                        ))}
                    </div>
                ) : (
                    /* --- MODO SEMANA: grid de 7 columnas (Hora + 6 días) --- */
                    <div className="horario-grid">
                        <div className="grid-header">Hora</div>
                        {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map(day => <div key={day} className="grid-header">{day}</div>)}
                        {horas.map(hora => (<React.Fragment key={hora}><div className="time-slot">{hora}</div>{[...Array(6)].map((_, i) => (<div key={`${hora}-${i}`} className="grid-cell"></div>))}</React.Fragment>))}
                    </div>
                )}
                
                {/* Capa de tarjetas superpuesta — siempre con el grid correspondiente */}
                <div className={`horario-grid ${isDayMode ? 'day-grid' : ''}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    {displayClases.filter(c => c.dia && c.hora_inicio).map((clase, i) => (
                        <ClaseCard 
                            key={`${clase.nrc}-${clase.dia}-${i}`}
                            clase={clase} 
                            tieneCruce={nrcsConCruce.has(clase.nrc)} 
                            onRemove={onRemoveClase}
                            isTapped={tappedNrcs.has(`${clase.nrc}-${clase.dia}`)}
                            onTap={toggleTap}
                            isDayMode={isDayMode}
                        />
                    ))}
                </div>
            </div>

            <div className="descargas">
                <button className="primary-button" onClick={handleDownloadPdf}>📄 Descargar PDF</button>
                <button className="primary-button" onClick={() => { setImageTheme(theme); setIsModalOpen(true); }}>🖼️ Descargar Imagen</button>
            </div>
            
            {isRendering && <div className="loading-overlay">Generando imagen...</div>}

            {isModalOpen && createPortal(
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content animate-scale-up" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{margin:0}}>Configurar Imagen</h2>
                            <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>×</button>
                        </div>
                        <p style={{ marginTop: '0.5rem' }}>Personaliza el fondo de pantalla.</p>
                        <div className="image-options">
                            <div className="option-group"><strong>Formato</strong><button onClick={() => setAspectRatio('9/16')} className={aspectRatio === '9/16' ? 'active' : ''}>📱 Móvil</button><button onClick={() => setAspectRatio('16/9')} className={aspectRatio === '16/9' ? 'active' : ''}>💻 PC</button></div>
                            <div className="option-group"><strong>Tema</strong><button onClick={() => setImageTheme('light')} className={imageTheme === 'light' ? 'active' : ''}>☀️ Claro</button><button onClick={() => setImageTheme('dark')} className={imageTheme === 'dark' ? 'active' : ''}>🌙 Oscuro</button></div>
                        </div>
                        <button className="primary-button generate-btn" onClick={handleGenerateImage}>✨ Generar y Descargar</button>
                    </div>
                </div>, document.body
            )}

            {createPortal(
                <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: `${renderSize.width}px`, height: `${renderSize.height}px`, zIndex: -1, backgroundColor: imageTheme === 'light' ? '#ffffff' : '#212529' }}>
                    <HorarioImagen ref={imageRenderRef} clases={clasesSeleccionadas} calendarioLabel={calendarioLabel} aspectRatio={aspectRatio} theme={imageTheme} />
                </div>, document.body
            )}
        </div>
    );
}