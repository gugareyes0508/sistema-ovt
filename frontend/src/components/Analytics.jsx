import React, { useState, useEffect } from 'react';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { llamarGroq } from '../utils/groqClient';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const Analytics = ({ registros = [], usuarios = [], token }) => {
  const [activeTab, setActiveTab] = useState('resumen');
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [discardedInsights, setDiscardedInsights] = useState(() => {
    const saved = localStorage.getItem('discardedInsights');
    return saved ? JSON.parse(saved) : [];
  });
  const [insightId, setInsightId] = useState(null);
  const [generationCount, setGenerationCount] = useState(0);

  // Estados para Agrupación IA
  const [agrupacion, setAgrupacion] = useState(null);
  const [loadingAgrupacion, setLoadingAgrupacion] = useState(false);
  const [errorAgrupacion, setErrorAgrupacion] = useState(null);
  const [rangoAgrupacion, setRangoAgrupacion] = useState('mes'); // 'mes' | 'anio' | 'todo'

  const ahoraInicial = new Date();
  const [filtroMes, setFiltroMes] = useState(ahoraInicial.getMonth() + 1);
  const [filtroAnio, setFiltroAnio] = useState(ahoraInicial.getFullYear());
  const [filtroEmpresa, setFiltroEmpresa] = useState('todas');

  // Convertir fecha a Date
  const toDate = (fecha) => {
    if (fecha instanceof Date) return fecha;
    if (typeof fecha === 'string') {
      if (fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = fecha.split('-').map(Number);
        return new Date(year, month - 1, day, 0, 0, 0);
      }
      if (fecha.includes('T')) return new Date(fecha);
      return new Date(fecha);
    }
    if (fecha && fecha.toDate && typeof fecha.toDate === 'function') return fecha.toDate();
    if (fecha && fecha._seconds) return new Date(fecha._seconds * 1000);
    return new Date();
  };

  // Mapeo nombre -> empresa contratista (para el filtro y el gráfico)
  const mapaEmpresaPorNombre = {};
  (usuarios || []).forEach(u => { mapaEmpresaPorNombre[u.nombre] = u.empresa || 'Sin asignar'; });

  // Procesar datos
  const procesarDatos = () => {
    if (!registros || registros.length === 0) {
      return {
        total: 0,
        porTipo: { cambios: 0, alertas: 0, incidentes: 0, requerimientos: 0 },
        porEspecialidad: {},
        porPersona: {},
        porSemana: {},
        porDia: {},
        porHora: Array.from({ length: 24 }, () => 0),
        registrosFiltrados: []
      };
    }

    let registrosFiltrados = registros.filter(r => {
      if (r.estado !== 'exitoso') return false;
      const fecha = toDate(r.fechaInicio);
      if (fecha.getMonth() + 1 !== filtroMes || fecha.getFullYear() !== filtroAnio) return false;
      if (filtroEmpresa !== 'todas') {
        const nombre = r.createdByNombre || r.especialista || '';
        const empresa = mapaEmpresaPorNombre[nombre] || 'Sin asignar';
        if (empresa !== filtroEmpresa) return false;
      }
      return true;
    });

    const datos = {
      total: registrosFiltrados.reduce((sum, r) => sum + (r.horas || 0), 0),
      porTipo: { cambios: 0, alertas: 0, incidentes: 0, requerimientos: 0 },
      porEspecialidad: {},
      porPersona: {},
      porSemana: {},
      porDia: { 'Lun': 0, 'Mar': 0, 'Mié': 0, 'Jue': 0, 'Vie': 0, 'Sab': 0, 'Dom': 0 },
      porHora: Array.from({ length: 24 }, () => 0),
      registrosFiltrados: registrosFiltrados
    };

    registrosFiltrados.forEach(r => {
      const horas = r.horas || 0;
      const fecha = toDate(r.fechaInicio);

      // Por Tipo
      if (r.tipo === 'cambio') datos.porTipo.cambios += horas;
      else if (r.tipo === 'alerta') datos.porTipo.alertas += horas;
      else if (r.tipo === 'incidente') datos.porTipo.incidentes += horas;
      else if (r.tipo === 'requerimiento') datos.porTipo.requerimientos += horas;

      // Por Especialidad
      const especialidad = r.especialidad || 'Sin especialidad';
      datos.porEspecialidad[especialidad] = (datos.porEspecialidad[especialidad] || 0) + horas;

      // Por Persona
      const persona = r.createdByNombre || r.especialista || 'Sin especialista';
      datos.porPersona[persona] = (datos.porPersona[persona] || 0) + horas;

      // Por Semana
      const numeroSemana = getWeekNumber(fecha);
      const semanaKey = `S${numeroSemana}`;
      datos.porSemana[semanaKey] = (datos.porSemana[semanaKey] || 0) + horas;

      // Por Día
      const dia = fecha.getDay();
      const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sab'];
      datos.porDia[diasNombres[dia]] = (datos.porDia[diasNombres[dia]] || 0) + horas;

      // Por Hora del Día (en qué horario se concentra el overtime)
      const hora = fecha.getHours();
      datos.porHora[hora] += horas;
    });

    return datos;
  };

  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  // ============================================
  // Agrupación IA: lee todas las descripciones y agrupa por tipo de actividad
  // ============================================
  const generarAgrupacionIA = async () => {
    setLoadingAgrupacion(true);
    setErrorAgrupacion(null);
    setAgrupacion(null);

    try {
      // Seleccionar registros según el rango elegido
      // período según rango seleccionado
      const registrosFiltro = (registros || []).filter(r => {
        if (r.estado !== 'exitoso') return false;
        const f = toDate(r.fechaInicio);
        if (rangoAgrupacion === 'mes') {
          return f.getMonth() === filtroMes - 1 && f.getFullYear() === filtroAnio;
        }
        if (rangoAgrupacion === 'anio') return f.getFullYear() === filtroAnio;
        return true; // 'todo'
      });

      if (registrosFiltro.length === 0) {
        setErrorAgrupacion('No hay registros aprobados para el período seleccionado.');
        return;
      }

      // Construir input compacto para la IA: ticket | tipo | horas | descripción
      // Limitar el input para no superar el contexto: máx 80 registros, descripción a 100 chars
      const registrosTruncados = registrosFiltro.slice(0, 80);
      const descripcionesTexto = registrosTruncados
        .map(r => `- [${r.tipo?.toUpperCase() || 'N/A'}] ${(r.horas || 0)}h | ${(r.descripcion || '').substring(0, 100)}`)
        .join('\n');

      const totalH = registrosFiltro.reduce((s, r) => s + (r.horas || 0), 0);

      const systemMsg = 'Eres un analista IT experto en operaciones gestionadas. Agrupa actividades por propósito real, consolidando las que hacen lo mismo aunque estén en distintas plataformas. Responde SOLO con JSON válido y completo, sin texto adicional ni bloques de código.';

      const userMsg = `Analiza estas ${registrosTruncados.length} actividades de horas extra (${totalH.toFixed(1)}h) del equipo Kyndryl Chile:

${descripcionesTexto}

REGLAS DE AGRUPACIÓN:
1. Agrupa por PROPÓSITO REAL, no por plataforma (OCI, Azure, SCL son plataformas, no categorías).
2. "Parchados BAU", "Parchado Preventivo", "Parchado de Seguridad" → mismo grupo "Parchado BAU/Preventivo".
3. Misma actividad en múltiples plataformas → UN solo grupo.
4. Categorías sugeridas: Parchado BAU/Preventivo, Migración/Upgrade, Monitoreo/Alertas, Incidentes, Configuración/Despliegue, Soporte, Switchover/Continuidad, Instalación Software.
5. El porcentaje de cada grupo es sobre ${totalH.toFixed(1)}h total.

Responde SOLO con este JSON sin markdown:
{"grupos":[{"nombre":"string","descripcion":"string","registros":0,"horas":0.0,"porcentaje":0.0,"tendencia":"creciente|estable|decreciente","actividades_frecuentes":["a1","a2","a3"],"recomendacion":"string max 120 chars"}],"resumen_ejecutivo":"string","actividad_mas_costosa":"string","actividad_mas_frecuente":"string"}`;

      let respuestaTexto = '';
      try {
        const data = await llamarGroq(
          [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userMsg }
          ],
          { temperature: 0.1, maxTokens: 3000 }
        );
        respuestaTexto = data.choices?.[0]?.message?.content || '';
        console.log(`✅ Agrupación IA con modelo: ${data.model || '(desconocido)'}`);
      } catch (err) {
        console.warn('Error llamando a GROQ:', err.message);
      }

      if (!respuestaTexto) {
        throw new Error('No se pudo obtener respuesta de ningún modelo GROQ disponible.');
      }

      // Limpiar y parsear JSON de forma robusta
      let limpio = respuestaTexto
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      // Si el JSON está truncado, intentar repararlo buscando el último objeto completo
      if (!limpio.endsWith('}')) {
        const lastBrace = limpio.lastIndexOf('}');
        if (lastBrace !== -1) {
          limpio = limpio.substring(0, lastBrace + 1);
          // Asegurarse de que el JSON de nivel raíz esté cerrado
          const openBraces = (limpio.match(/{/g) || []).length;
          const closeBraces = (limpio.match(/}/g) || []).length;
          for (let i = 0; i < openBraces - closeBraces; i++) limpio += '}';
        }
      }

      const parsed = JSON.parse(limpio);
      if (!parsed.grupos || !Array.isArray(parsed.grupos)) {
        throw new Error('La IA no devolvió el formato esperado. Intenta de nuevo.');
      }

      setAgrupacion({ ...parsed, totalRegistros: registrosFiltro.length, totalHoras: totalH, rango: rangoAgrupacion });
    } catch (err) {
      console.error('Error Agrupación IA:', err);
      setErrorAgrupacion('Error generando agrupación: ' + err.message + '. Verifica que REACT_APP_GROQ_API_KEY esté configurado.');
    } finally {
      setLoadingAgrupacion(false);
    }
  };

  // Generar Insights con IA (GROQ) - con descartar
  const generarInsights = async (intentoNumero = 1) => {
    setLoading(true);
    setError(null);

    try {
      const datos = procesarDatos();
      
      const prompt = `Analiza estos datos de horas extra de Kyndryl Chile y genera insights ÚNICOS y DIFERENTES (intento ${intentoNumero}):

Total HHEE: ${datos.total.toFixed(2)}h
Cambios: ${datos.porTipo.cambios.toFixed(2)}h (${((datos.porTipo.cambios / datos.total) * 100).toFixed(1)}%)
Alertas: ${datos.porTipo.alertas.toFixed(2)}h (${((datos.porTipo.alertas / datos.total) * 100).toFixed(1)}%)
Incidentes: ${datos.porTipo.incidentes.toFixed(2)}h (${((datos.porTipo.incidentes / datos.total) * 100).toFixed(1)}%)
Requerimientos: ${datos.porTipo.requerimientos.toFixed(2)}h (${((datos.porTipo.requerimientos / datos.total) * 100).toFixed(1)}%)

Por Especialidad: ${JSON.stringify(datos.porEspecialidad)}
Top Especialistas: ${JSON.stringify(Object.entries(datos.porPersona).sort((a, b) => b[1] - a[1]).slice(0, 5))}
Por Día de Semana: ${JSON.stringify(datos.porDia)}

Genera un análisis en formato DIFERENTE (${intentoNumero > 1 ? 'evita insights previos' : 'primer análisis'}):
1. [INSIGHT] - Descripción corta (máx 80 caracteres)
2. [ALERTA] - Anomalía detectada (si aplica)
3. [RECOMENDACIÓN] - Acción sugerida

Sé conciso, específico y ORIGINAL.`;

      // Llamar a GROQ API (compatible con OpenAI)
      const data = await llamarGroq(
        [{ role: 'user', content: prompt }],
        { temperature: 0.7 + (intentoNumero * 0.1), maxTokens: 1000 } // Aumenta temperatura para respuestas más diversas
      );
      const respuestaTexto = data.choices[0].message.content;
      const nuevoId = `insight_${Date.now()}_${intentoNumero}`;
      
      setInsights(respuestaTexto);
      setInsightId(nuevoId);
    } catch (err) {
      setError('Error generando insights: ' + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Descartar insight actual y generar otro
  const descartarInsight = () => {
    if (!insightId) return;
    
    const nuevosDescartados = [...discardedInsights, insightId];
    setDiscardedInsights(nuevosDescartados);
    localStorage.setItem('discardedInsights', JSON.stringify(nuevosDescartados));
    
    setInsights(null);
    setInsightId(null);
    setGenerationCount(generationCount + 1);
    
    // Generar otro inmediatamente
    setTimeout(() => {
      generarInsights(generationCount + 2);
    }, 500);
  };

  // Limpiar todos los descartados
  const limpiarDescartados = () => {
    if (window.confirm('¿Limpiar el historial de insights descartados?')) {
      setDiscardedInsights([]);
      localStorage.setItem('discardedInsights', JSON.stringify([]));
      setInsights(null);
      setInsightId(null);
      setGenerationCount(0);
      alert('✅ Historial limpiado. Ahora verás todos los insights nuevamente.');
    }
  };

  useEffect(() => {
    if (activeTab === 'ia-insights' && !insights) {
      generarInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const datos = procesarDatos();

  // Distribución por Empresa Contratista (cruza registros con la empresa de cada especialista)
  const porEmpresa = {};
  (datos.registrosFiltrados || []).forEach(r => {
    const nombre = r.createdByNombre || r.especialista || '';
    const empresa = mapaEmpresaPorNombre[nombre] || 'Sin asignar';
    porEmpresa[empresa] = (porEmpresa[empresa] || 0) + (r.horas || 0);
  });
  const empresasOrdenadas = Object.entries(porEmpresa).sort((a, b) => b[1] - a[1]);
  const coloresEmpresa = { Kyndryl: '#FF462D', Incosec: '#3266ad', Biznet: '#1d9e75', 'Sin asignar': '#9aa0ad', Otro: '#ba7517' };
  const chartPorEmpresa = {
    labels: empresasOrdenadas.map(([nombre]) => nombre),
    datasets: [{
      data: empresasOrdenadas.map(([, h]) => h),
      backgroundColor: empresasOrdenadas.map(([nombre]) => coloresEmpresa[nombre] || '#73726c')
    }]
  };

  // Tendencia Anual de HHEE (Ene-Dic del año seleccionado, independiente del filtro de mes)
  const porMesAnio = Array.from({ length: 12 }, () => 0);
  (registros || []).forEach(r => {
    if (r.estado !== 'exitoso') return;
    const fecha = toDate(r.fechaInicio);
    if (fecha.getFullYear() !== filtroAnio) return;
    if (filtroEmpresa !== 'todas') {
      const nombre = r.createdByNombre || r.especialista || '';
      const empresa = mapaEmpresaPorNombre[nombre] || 'Sin asignar';
      if (empresa !== filtroEmpresa) return;
    }
    porMesAnio[fecha.getMonth()] += (r.horas || 0);
  });
  const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const chartTendenciaAnual = {
    labels: nombresMeses,
    datasets: [{
      label: `HHEE ${filtroAnio}`,
      data: porMesAnio,
      borderColor: '#3266ad',
      backgroundColor: 'rgba(50, 102, 173, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#3266ad',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 5
    }]
  };

  // Colores para gráficos
  const colores = ['#3266ad', '#e24b4a', '#73726c', '#ba7517', '#1d9e75'];

  // Gráfico Por Tipo
  const chartPorTipo = {
    labels: ['Cambios', 'Alertas', 'Incidentes', 'Requerimientos'],
    datasets: [{
      data: [datos.porTipo.cambios, datos.porTipo.alertas, datos.porTipo.incidentes, datos.porTipo.requerimientos],
      backgroundColor: ['#3266ad', '#e24b4a', '#ba7517', '#1d9e75'],
      borderColor: ['#3266ad', '#e24b4a', '#ba7517', '#1d9e75'],
      borderWidth: 2
    }]
  };

  // Gráfico Por Especialidad
  const especialidades = Object.keys(datos.porEspecialidad).sort(
    (a, b) => datos.porEspecialidad[b] - datos.porEspecialidad[a]
  );
  const chartPorEspecialidad = {
    labels: especialidades,
    datasets: [{
      label: 'Horas',
      data: especialidades.map(e => datos.porEspecialidad[e]),
      backgroundColor: colores,
      borderColor: colores,
      borderWidth: 1
    }]
  };

  // Gráfico Top Especialistas
  const topEspecialistas = Object.entries(datos.porPersona)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const chartTopEspecialistas = {
    labels: topEspecialistas.map(e => e[0]),
    datasets: [{
      label: 'Horas',
      data: topEspecialistas.map(e => e[1]),
      backgroundColor: colores[0],
      borderColor: colores[0],
      borderWidth: 1
    }]
  };

  // Gráfico Semana a Semana
  const semanas = Object.keys(datos.porSemana).sort();
  const chartSemanal = {
    labels: semanas,
    datasets: [{
      label: 'HHEE por Semana',
      data: semanas.map(s => datos.porSemana[s]),
      borderColor: '#3266ad',
      backgroundColor: 'rgba(50, 102, 173, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#3266ad',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 5
    }]
  };

  // Gráfico Por Día
  const diasOrden = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sab', 'Dom'];
  const chartPorDia = {
    labels: diasOrden,
    datasets: [{
      label: 'Horas por Día',
      data: diasOrden.map(d => datos.porDia[d] || 0),
      backgroundColor: '#ba7517',
      borderColor: '#ba7517',
      borderWidth: 1
    }]
  };

  // Gráfico Por Hora del Día (en qué horario se concentra el overtime)
  const horasEtiquetas = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const chartPorHora = {
    labels: horasEtiquetas,
    datasets: [{
      label: 'Horas concentradas',
      data: datos.porHora,
      backgroundColor: '#73726c',
      borderColor: '#73726c',
      borderWidth: 1
    }]
  };

  // Opciones comunes para gráficos
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { padding: 15, font: { size: 12 } }
      },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: 12,
        titleFont: { size: 13 },
        bodyFont: { size: 12 }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: { font: { size: 11 } }
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 } }
      }
    }
  };

  // Variante sin leyenda: para gráficos de barras donde el eje X ya identifica la categoría
  // (evita mostrar "Horas" como si fuera el nombre de la categoría)
  const chartOptionsSinLeyenda = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      legend: { display: false },
      tooltip: {
        ...chartOptions.plugins.tooltip,
        callbacks: {
          label: (context) => `${context.dataset.label || ''}: ${(context.raw ?? 0).toFixed(1)}h`
        }
      }
    }
  };

  // Variante para gráficos circulares (Doughnut/Pie): sin ejes cartesianos,
  // y tooltip forzado a 1 decimal para que sea consistente con el resto del Resumen
  const chartOptionsDoughnut = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { padding: 15, font: { size: 12 } }
      },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: 12,
        titleFont: { size: 13 },
        bodyFont: { size: 12 },
        callbacks: {
          label: (context) => `${context.label}: ${context.parsed.toFixed(1)}h`
        }
      }
    }
  };

  return (
    <div style={{ padding:0, fontFamily:"Manrope,ui-sans-serif,system-ui,sans-serif" }}>

      {/* ── FILTROS ── */}
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-end', marginBottom:'20px' }}>
        {[
          { label:'Mes', content:
            <select value={filtroMes} onChange={e=>setFiltroMes(parseInt(e.target.value))}
              style={{ border:'1px solid rgba(18,52,78,0.13)', borderRadius:'12px', padding:'9px 14px', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)', fontSize:'13px', fontWeight:'600', minWidth:'130px' }}>
              {[...Array(12)].map((_,i)=><option key={i+1} value={i+1}>{new Date(2024,i).toLocaleString('es-CL',{month:'long'})}</option>)}
            </select>
          },
          { label:'Año', content:
            <select value={filtroAnio} onChange={e=>setFiltroAnio(parseInt(e.target.value))}
              style={{ border:'1px solid rgba(18,52,78,0.13)', borderRadius:'12px', padding:'9px 14px', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)', fontSize:'13px', fontWeight:'600', minWidth:'100px' }}>
              {['2023','2024','2025','2026','2027'].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          },
          { label:'Empresa contratista', content:
            <select value={filtroEmpresa} onChange={e=>setFiltroEmpresa(e.target.value)}
              style={{ border:'1px solid rgba(18,52,78,0.13)', borderRadius:'12px', padding:'9px 14px', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)', fontSize:'13px', fontWeight:'600', minWidth:'160px' }}>
              <option value="todas">Todas</option>
              <option value="Kyndryl">Kyndryl</option>
              <option value="Incosec">Incosec</option>
              <option value="Biznet">Biznet</option>
              <option value="Otro">Otro</option>
            </select>
          }
        ].map(f=>(
          <div key={f.label}>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'10px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:'6px' }}>{f.label}</div>
            {f.content}
          </div>
        ))}
      </div>

      {/* ── KPI MÉTRICAS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:'14px', marginBottom:'20px' }}>
        {[
          { label:'Total HHEE',      val:`${datos.total.toFixed(0)}h`,                           color:'var(--kyn-red)' },
          { label:'Cambios',         val:`${datos.porTipo.cambios.toFixed(0)}h`,                  color:'var(--bank-blue)' },
          { label:'Alertas',         val:`${datos.porTipo.alertas.toFixed(0)}h`,                  color:'var(--danger)' },
          { label:'Incidentes',      val:`${datos.porTipo.incidentes.toFixed(0)}h`,               color:'var(--warning)' },
          { label:'Requerimientos',  val:`${datos.porTipo.requerimientos.toFixed(0)}h`,           color:'var(--success)' },
          { label:'Registros',       val:datos.registrosFiltrados.length,                         color:'var(--ink-800)' },
        ].map(k=>(
          <div key={k.label} style={{ background:'var(--glass)', border:'1px solid rgba(255,255,255,0.72)', borderRadius:'24px', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'16px' }}>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:'8px' }}>{k.label}</div>
            <div style={{ fontSize:'1.8rem', fontWeight:'800', lineHeight:1, letterSpacing:'-.07em', color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* ── TABS ── */}
      <div style={{ display:'inline-flex', flexWrap:'wrap', gap:'6px', padding:'5px', border:'1px solid rgba(18,52,78,0.09)', borderRadius:'16px', background:'rgba(255,255,255,0.55)', marginBottom:'20px' }}>
        {[
          { id:'resumen', label:'Resumen' },
          { id:'tendencias', label:'Tendencias' },
          { id:'persona', label:'Por Persona' },
          { id:'area', label:'Por Área' },
          { id:'ia-insights', label:'IA Insights' },
          { id:'ia-agrupacion', label:'Agrupación IA' }
        ].map(tab=>(
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
            style={{ borderRadius:'11px', padding:'8px 14px', background: activeTab===tab.id ? 'var(--ink-900)' : 'transparent',
              color: activeTab===tab.id ? '#fff' : 'var(--muted)', fontWeight:'900', fontSize:'12px', border:'none', transition:'all .16s', cursor:'pointer' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: RESUMEN ── */}
      {activeTab === 'resumen' && (<>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'16px', marginBottom:'16px' }}>
          {[
            { label:'Horas por tipo', chart:<Doughnut data={chartPorTipo} options={chartOptionsDoughnut}/> },
            { label:'Horas por especialidad', chart:<Bar data={chartPorEspecialidad} options={chartOptionsSinLeyenda}/> },
            { label:'Por empresa contratista', chart:<Doughnut data={chartPorEmpresa} options={chartOptionsDoughnut}/> },
          ].map(c=>(
            <div key={c.label} style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'20px' }}>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.09em', marginBottom:'4px' }}>Distribución</div>
              <h3 style={{ margin:'0 0 14px', fontSize:'1rem', fontWeight:'800', color:'var(--ink-950)', letterSpacing:'-.03em' }}>{c.label}</h3>
              <div style={{ position:'relative', height:'220px', overflow:'hidden' }}>{c.chart}</div>
            </div>
          ))}
        </div>
        <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'20px' }}>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.09em', marginBottom:'4px' }}>Tendencia</div>
          <h3 style={{ margin:'0 0 4px', fontSize:'1rem', fontWeight:'800', color:'var(--ink-950)', letterSpacing:'-.03em' }}>Tendencia anual de HHEE — {filtroAnio}</h3>
          <p style={{ fontSize:'11px', color:'var(--muted)', fontWeight:'600', margin:'0 0 14px' }}>Horas acumuladas por mes · no afectado por el filtro de Mes</p>
          <div style={{ position:'relative', height:'260px', overflow:'hidden' }}><Line data={chartTendenciaAnual} options={chartOptions}/></div>
        </div>
      </>)}

      {/* ── TAB: TENDENCIAS ── */}
      {activeTab === 'tendencias' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(360px,1fr))', gap:'16px' }}>
          {[
            { label:'Evolución semana a semana', chart:<Line data={chartSemanal} options={chartOptions}/>, height:280 },
            { label:'HHEE por día de semana', chart:<Bar data={chartPorDia} options={chartOptionsSinLeyenda}/>, height:280 },
            { label:'Concentración por hora del día', sub:'Basado en hora de inicio de cada registro', chart:<Bar data={chartPorHora} options={chartOptionsSinLeyenda}/>, height:260, full:true },
          ].map(c=>(
            <div key={c.label} style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'20px', ...(c.full?{gridColumn:'1/-1'}:{}) }}>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.09em', marginBottom:'4px' }}>Tendencia</div>
              <h3 style={{ margin:'0 0 4px', fontSize:'1rem', fontWeight:'800', color:'var(--ink-950)', letterSpacing:'-.03em' }}>{c.label}</h3>
              {c.sub && <p style={{ fontSize:'11px', color:'var(--muted)', fontWeight:'600', margin:'0 0 12px' }}>{c.sub}</p>}
              <div style={{ position:'relative', height:`${c.height}px`, overflow:'hidden', marginTop: c.sub?0:12 }}>{c.chart}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: POR PERSONA ── */}
      {activeTab === 'persona' && (
        <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'20px' }}>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.09em', marginBottom:'4px' }}>Especialistas</div>
          <h3 style={{ margin:'0 0 16px', fontSize:'1rem', fontWeight:'800', color:'var(--ink-950)', letterSpacing:'-.03em' }}>Top especialistas · horas imputadas</h3>
          <div style={{ position:'relative', height:'400px', overflow:'hidden' }}>
            <Bar data={chartTopEspecialistas} options={{ ...chartOptionsSinLeyenda, indexAxis:'y' }}/>
          </div>
        </div>
      )}

      {/* ── TAB: POR ÁREA ── */}
      {activeTab === 'area' && (
        <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'20px' }}>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.09em', marginBottom:'4px' }}>Distribución</div>
          <h3 style={{ margin:'0 0 16px', fontSize:'1rem', fontWeight:'800', color:'var(--ink-950)', letterSpacing:'-.03em' }}>Desglose por especialidad</h3>
          <table className="tabla">
            <thead><tr>
              <th>Especialidad</th>
              <th style={{textAlign:'right'}}>Horas</th>
              <th style={{textAlign:'right'}}>% del total</th>
            </tr></thead>
            <tbody>
              {Object.entries(datos.porEspecialidad).sort((a,b)=>b[1]-a[1]).map(([esp,h])=>(
                <tr key={esp}>
                  <td style={{fontWeight:'700'}}>{esp}</td>
                  <td style={{textAlign:'right',fontFamily:"'IBM Plex Mono',monospace",fontWeight:'700',color:'var(--kyn-red)'}}>{h.toFixed(1)}h</td>
                  <td style={{textAlign:'right'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px',justifyContent:'flex-end'}}>
                      <div style={{width:'60px',height:'5px',background:'rgba(18,52,78,0.1)',borderRadius:'2px',overflow:'hidden'}}>
                        <div style={{width:`${datos.total>0?Math.round(h/datos.total*100):0}%`,height:'100%',background:'var(--bank-blue)',borderRadius:'2px'}}></div>
                      </div>
                      <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:'11px',fontWeight:'700',color:'var(--muted)',minWidth:'34px',textAlign:'right'}}>
                        {datos.total > 0 ? Math.round(h/datos.total*100) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB: IA INSIGHTS ── */}
      {activeTab === 'ia-insights' && (
        <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'20px' }}>
          <h3 style={{margin:'0 0 14px',fontSize:'1rem',fontWeight:'800',color:'var(--ink-950)',letterSpacing:'-.03em'}}>🤖 Análisis Inteligente</h3>
          
          {/* Info de descartados */}
          {discardedInsights.length > 0 && (
            <div style={{
              background: '#e3f2fd',
              padding: '12px',
              borderRadius:'10px',
              marginBottom: '15px',
              fontSize: '12px',
              color:'var(--bank-blue)',
              border: '1px solid #90caf9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>📊 {discardedInsights.length} insights descartados ({generationCount} generaciones)</span>
              <button
                onClick={limpiarDescartados}
                style={{
                  padding: '4px 12px',
                  background: '#1565c0',
                  color: 'white',
                  border: 'none',
                  borderRadius:'8px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight:'700'
                }}
              >
                🔄 Limpiar Historial
              </button>
            </div>
          )}
          
          {loading && (
            <p style={{ color:'var(--muted)', fontStyle: 'italic' }}>⏳ Analizando datos con IA...</p>
          )}
          {error && (
            <p style={{ color: '#e24b4a', fontStyle: 'italic' }}>❌ {error}</p>
          )}
          {insights && (
            <div>
              <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', color:'var(--ink-950)', background:'rgba(238,245,248,0.6)', padding: '15px', borderRadius:'10px', marginBottom: '15px' }}>
                {insights}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={descartarInsight}
                  style={{
                    flex: 1,
                    padding: '12px 20px',
                    background: '#FF6B6B',
                    color: 'white',
                    border: 'none',
                    borderRadius:'8px',
                    cursor: 'pointer',
                    fontSize:'13px',
                    fontWeight:'700',
                    transition: 'all 0.3s'
                  }}
                  onMouseOver={(e) => e.target.style.background = '#E63946'}
                  onMouseOut={(e) => e.target.style.background = '#FF6B6B'}
                >
                  ❌ Descartar este Insight
                </button>
                <button
                  onClick={() => generarInsights(generationCount + 1)}
                  style={{
                    flex: 1,
                    padding: '12px 20px',
                    background: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius:'8px',
                    cursor: 'pointer',
                    fontSize:'13px',
                    fontWeight:'700',
                    transition: 'all 0.3s'
                  }}
                  onMouseOver={(e) => e.target.style.background = '#45a049'}
                  onMouseOut={(e) => e.target.style.background = '#4CAF50'}
                >
                  🔄 Generar Otro
                </button>
              </div>
            </div>
          )}
          {!loading && !insights && !error && (
            <button
              onClick={() => generarInsights(1)}
              style={{
                padding: '10px 20px',
                background: '#3266ad',
                color: 'white',
                border: 'none',
                borderRadius:'8px',
                cursor: 'pointer',
                fontSize:'13px',
                fontWeight:'700'
              }}
            >
              🚀 Generar Análisis IA
            </button>
          )}
        </div>
      )}

      {/* ── TAB: AGRUPACIÓN IA ── */}
      {activeTab === 'ia-agrupacion' && (
        <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'20px' }}>
          <h3 style={{ marginTop: 0, color:'var(--ink-950)' }}>🔍 Agrupación por Tipo de Actividad (IA)</h3>
          <p style={{ fontSize: '13px', color:'var(--muted)', marginBottom: '20px' }}>
            La IA lee todas las descripciones de los registros aprobados, las agrupa por categorías de actividad, detecta cuáles se repiten más y cuáles generan más tiempo.
          </p>

          {/* Controles */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', background:'rgba(238,245,248,0.7)', padding: '14px', borderRadius:'14px', marginBottom: '20px' }}>
            <div className="form-group" style={{ minWidth: '170px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '5px' }}>Período a analizar</label>
              <select value={rangoAgrupacion} onChange={(e) => { setRangoAgrupacion(e.target.value); setAgrupacion(null); }}>
                <option value="mes">Mes actual ({new Date(2024, filtroMes - 1).toLocaleString('es-CL', { month: 'long' })} {filtroAnio})</option>
                <option value="anio">Año completo ({filtroAnio})</option>
                <option value="todo">Todos los registros</option>
              </select>
            </div>
            <button
              onClick={generarAgrupacionIA}
              disabled={loadingAgrupacion}
              style={{
                padding: '10px 20px', background: loadingAgrupacion ? '#9ca3af' : '#1f2937',
                color: 'white', border: 'none', borderRadius:'14px',
                cursor: loadingAgrupacion ? 'not-allowed' : 'pointer',
                fontWeight: '700', fontSize: '13px'
              }}
            >
              {loadingAgrupacion ? '⏳ Analizando...' : '🔍 Analizar Descripciones'}
            </button>
            {agrupacion && (
              <button
                onClick={() => setAgrupacion(null)}
                style={{ padding: '10px 14px', background: '#f3f4f6', color:'#12344e', border: '1px solid #d1d5db', borderRadius:'14px', cursor: 'pointer', fontSize: '13px' }}
              >
                🔄 Nueva Consulta
              </button>
            )}
          </div>

          {errorAgrupacion && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius:'14px', padding: '14px', color: '#991b1b', fontSize: '13px', marginBottom: '16px' }}>
              ❌ {errorAgrupacion}
            </div>
          )}

          {loadingAgrupacion && (
            <div style={{ textAlign: 'center', padding: '40px', color:'var(--muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🤖</div>
              <p style={{ fontWeight: '600' }}>La IA está leyendo y agrupando las descripciones...</p>
              <p style={{ fontSize: '12px' }}>Esto puede tomar unos segundos según la cantidad de registros.</p>
            </div>
          )}

          {agrupacion && (
            <>
              {/* Resumen ejecutivo */}
              <div style={{ background:'rgba(0,59,113,0.07)', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '18px', marginBottom: '24px' }}>
                <div style={{ fontWeight: '700', color:'var(--bank-blue)', marginBottom: '8px' }}>📋 Resumen Ejecutivo</div>
                <p style={{ margin: 0, fontSize: '13.5px', color: '#1e3a8a', lineHeight: '1.6' }}>{agrupacion.resumen_ejecutivo}</p>
                <div style={{ display: 'flex', gap: '20px', marginTop: '14px', fontSize: '12px', flexWrap: 'wrap' }}>
                  <span>🏋️ <strong>Mayor carga:</strong> {agrupacion.actividad_mas_costosa}</span>
                  <span>🔁 <strong>Más frecuente:</strong> {agrupacion.actividad_mas_frecuente}</span>
                  <span>📊 <strong>Total analizado:</strong> {agrupacion.totalRegistros} registros · {agrupacion.totalHoras?.toFixed(1)}h</span>
                </div>
              </div>

              {/* Cards por grupo */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {(agrupacion.grupos || []).sort((a, b) => b.horas - a.horas).map((grupo, idx) => {
                  const colores = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d'];
                  const color = colores[idx % colores.length];
                  const tendenciaIcon = grupo.tendencia === 'creciente' ? '📈' : grupo.tendencia === 'decreciente' ? '📉' : '➡️';
                  return (
                    <div key={idx} style={{ background: 'white', border: `2px solid ${color}20`, borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ background: color, padding: '14px 16px', color: 'white' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize:'13px' }}>{grupo.nombre}</strong>
                          <span style={{ fontSize: '11px', opacity: 0.9 }}>{tendenciaIcon} {grupo.tendencia}</span>
                        </div>
                        <div style={{ fontSize: '11.5px', opacity: 0.85, marginTop: '4px' }}>{grupo.descripcion}</div>
                      </div>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px', textAlign: 'center' }}>
                          <div style={{ background: `${color}10`, borderRadius:'10px', padding: '8px' }}>
                            <div style={{ fontSize: '18px', fontWeight: '800', color }}>{grupo.horas?.toFixed(1)}h</div>
                            <div style={{ fontSize: '10px', color:'var(--muted)' }}>Horas</div>
                          </div>
                          <div style={{ background: `${color}10`, borderRadius:'10px', padding: '8px' }}>
                            <div style={{ fontSize: '18px', fontWeight: '800', color }}>{grupo.registros}</div>
                            <div style={{ fontSize: '10px', color:'var(--muted)' }}>Registros</div>
                          </div>
                          <div style={{ background: `${color}10`, borderRadius:'10px', padding: '8px' }}>
                            <div style={{ fontSize: '18px', fontWeight: '800', color }}>{grupo.porcentaje?.toFixed(1)}%</div>
                            <div style={{ fontSize: '10px', color:'var(--muted)' }}>Del total</div>
                          </div>
                        </div>
                        {grupo.actividades_frecuentes?.length > 0 && (
                          <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color:'#12344e', marginBottom: '5px' }}>Actividades más frecuentes:</div>
                            {grupo.actividades_frecuentes.map((act, i) => (
                              <div key={i} style={{ fontSize: '11.5px', color:'var(--muted)', padding: '2px 0' }}>· {act}</div>
                            ))}
                          </div>
                        )}
                        {grupo.recomendacion && (
                          <div style={{ background:'rgba(238,245,248,0.7)', borderLeft: `3px solid ${color}`, padding: '8px 10px', borderRadius: '0 6px 6px 0', fontSize: '11.5px', color:'#12344e' }}>
                            💡 {grupo.recomendacion}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!agrupacion && !loadingAgrupacion && !errorAgrupacion && (
            <div style={{ textAlign: 'center', padding: '50px', color:'#8a96a3' }}>
              <div style={{ fontSize: '48px', marginBottom: '14px' }}>🔍</div>
              <p style={{ fontSize:'13px', fontWeight: '600' }}>Selecciona el período y haz clic en "Analizar Descripciones"</p>
              <p style={{ fontSize: '12px' }}>La IA agrupará automáticamente tus actividades en categorías y te dirá cuáles consumen más tiempo y se repiten más.</p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '30px', padding: '15px', background:'rgba(238,245,248,0.6)', borderRadius:'14px', textAlign: 'center', fontSize: '12px', color:'#8a96a3' }}>
        📊 Datos actualizados al momento • Período: {new Date(2024, filtroMes - 1).toLocaleString('es-CL', { month: 'long' })} {filtroAnio}{filtroEmpresa !== 'todas' ? ` • Empresa: ${filtroEmpresa}` : ''}
      </div>
    </div>
  );
}
export default Analytics;
