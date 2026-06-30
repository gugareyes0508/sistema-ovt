import React, { useState, useEffect } from 'react';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
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
      const descripcionesTexto = registrosFiltro
        .map(r => `- [${r.tipo?.toUpperCase() || 'N/A'}] ${(r.horas || 0)}h | ${(r.descripcion || '').substring(0, 150)}`)
        .join('\n');

      const totalH = registrosFiltro.reduce((s, r) => s + (r.horas || 0), 0);

      const prompt = `Eres un analista senior de operaciones IT especializado en servicios gestionados. Analiza estas ${registrosFiltro.length} actividades de horas extra (${totalH.toFixed(1)}h en total) del equipo Kyndryl Chile:

${descripcionesTexto}

INSTRUCCIONES CLAVE DE AGRUPACIÓN:
1. Agrupa por INTENCIÓN y PROPÓSITO REAL, NO por plataforma ni sistema (OCI, Azure, AWS, middleware son plataformas, no categorías).
2. Consolida: "Parchados BAU", "Preventivo Parchado", "Parchado de Seguridad" y "Mantención/OCI/Parchado" son TODOS la misma categoría → "Parchado BAU / Preventivo".
3. Si la misma actividad aparece en múltiples plataformas (OCI, Azure, SCL), va al MISMO grupo.
4. Evita grupos demasiado genéricos como "Otros" o "Misceláneos" — intenta clasificar todo.
5. Los grupos ideales para operaciones IT son: Parchado BAU / Preventivo, Migración y Upgrade, Monitoreo y Alertas, Incidentes de Producción, Configuración y Despliegue, Soporte a Usuarios/Clientes, Switchover / Continuidad, Instalación de Agentes/Software.
6. Crea NUEVOS grupos si los datos lo justifican, pero no fragmentes innecesariamente.
7. Suma correctamente las horas y registros de TODAS las actividades del grupo. El porcentaje es sobre el total de ${totalH.toFixed(1)}h.
8. Para "tendencia": basate en si hay actividades repetidas semana a semana (creciente), estables, o solo ocurrieron una vez (decreciente).

Devuelve EXACTAMENTE este JSON (sin markdown, sin texto extra):

{
  "grupos": [
    {
      "nombre": "Nombre corto y descriptivo del grupo",
      "descripcion": "Qué actividades incluye concretamente (1 línea)",
      "registros": 5,
      "horas": 12.5,
      "porcentaje": 23.5,
      "tendencia": "creciente|estable|decreciente",
      "actividades_frecuentes": ["ejemplo actividad 1", "ejemplo actividad 2", "ejemplo actividad 3"],
      "recomendacion": "Recomendación concreta y accionable basada en el patrón (máx 130 caracteres)"
    }
  ],
  "resumen_ejecutivo": "2-3 líneas: hallazgo principal, qué categoría consume más recursos y qué debería hacer el equipo.",
  "actividad_mas_costosa": "Nombre del grupo con más horas",
  "actividad_mas_frecuente": "Nombre del grupo con más registros"
}`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Eres un analista IT experto en operaciones gestionadas. Tu tarea es agrupar actividades por propósito real, consolidando las que hacen lo mismo aunque estén en distintas plataformas. Responde SOLO con JSON válido, sin texto adicional ni bloques de código.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 2500
        })
      });

      const data = await response.json();
      const texto = data.choices?.[0]?.message?.content || '';
      const limpio = texto.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(limpio);
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
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7 + (intentoNumero * 0.1), // Aumenta temperatura para respuestas más diversas
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error('Error en GROQ: ' + (errorData.error?.message || response.statusText));
      }

      const data = await response.json();
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
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>📊 Analytics - Análisis de HHEE</h2>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '20px', background: '#f5f5f5', padding: '14px 16px', borderRadius: '8px' }}>
        <div className="form-group" style={{ minWidth: '140px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '5px' }}>Mes</label>
          <select value={filtroMes} onChange={(e) => setFiltroMes(parseInt(e.target.value))}>
            {[...Array(12)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(2024, i).toLocaleString('es-CL', { month: 'long' })}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: '110px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '5px' }}>Año</label>
          <select value={filtroAnio} onChange={(e) => setFiltroAnio(parseInt(e.target.value))}>
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
        <div className="form-group" style={{ minWidth: '180px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '5px' }}>Empresa Contratista</label>
          <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="Kyndryl">Kyndryl</option>
            <option value="Incosec">Incosec</option>
            <option value="Biznet">Biznet</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
      </div>

      {/* Métricas Principales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '30px' }}>
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#666', fontWeight: 'bold' }}>Total HHEE</p>
          <p style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 'bold', color: '#3266ad' }}>{datos.total.toFixed(0)}h</p>
        </div>
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#666', fontWeight: 'bold' }}>Cambios</p>
          <p style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 'bold', color: '#3266ad' }}>{datos.porTipo.cambios.toFixed(0)}h</p>
        </div>
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#666', fontWeight: 'bold' }}>Alertas</p>
          <p style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 'bold', color: '#e24b4a' }}>{datos.porTipo.alertas.toFixed(0)}h</p>
        </div>
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#666', fontWeight: 'bold' }}>Incidentes</p>
          <p style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 'bold', color: '#ba7517' }}>{datos.porTipo.incidentes.toFixed(0)}h</p>
        </div>
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#666', fontWeight: 'bold' }}>Requerimientos</p>
          <p style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 'bold', color: '#1d9e75' }}>{datos.porTipo.requerimientos.toFixed(0)}h</p>
        </div>
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#666', fontWeight: 'bold' }}>Registros</p>
          <p style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 'bold', color: '#1d9e75' }}>{datos.registrosFiltrados.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #ddd', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[
          { id: 'resumen', label: '📊 Resumen' },
          { id: 'tendencias', label: '📈 Tendencias' },
          { id: 'persona', label: '👥 Por Persona' },
          { id: 'area', label: '🏢 Por Área' },
          { id: 'ia-insights', label: '🤖 IA Insights' },
          { id: 'ia-agrupacion', label: '🔍 Agrupación IA' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 15px',
              border: 'none',
              background: activeTab === tab.id ? '#3266ad' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#666',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              borderBottom: activeTab === tab.id ? '3px solid #3266ad' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Resumen */}
      {activeTab === 'resumen' && (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>HHEE por Tipo</h3>
            <div style={{ position: 'relative', height: '250px', overflow: 'hidden' }}>
              <Doughnut data={chartPorTipo} options={chartOptionsDoughnut} />
            </div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>HHEE por Especialidad</h3>
            <div style={{ position: 'relative', height: '250px', overflow: 'hidden' }}>
              <Bar data={chartPorEspecialidad} options={chartOptionsSinLeyenda} />
            </div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>Distribución por Empresa Contratista</h3>
            <div style={{ position: 'relative', height: '250px', overflow: 'hidden' }}>
              <Doughnut data={chartPorEmpresa} options={chartOptionsDoughnut} />
            </div>
          </div>
        </div>

        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee', marginTop: '20px' }}>
          <h3>Tendencia Anual de HHEE — {filtroAnio}</h3>
          <p style={{ fontSize: '12px', color: '#999', margin: '0 0 12px' }}>
            Horas extra acumuladas por mes durante todo el año (no se ve afectado por el filtro de Mes)
          </p>
          <div style={{ position: 'relative', height: '280px', overflow: 'hidden' }}>
            <Line data={chartTendenciaAnual} options={chartOptions} />
          </div>
        </div>
        </>
      )}

      {/* Tab: Tendencias */}
      {activeTab === 'tendencias' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>Evolución Semana a Semana</h3>
            <div style={{ position: 'relative', height: '300px', overflow: 'hidden' }}>
              <Line data={chartSemanal} options={chartOptions} />
            </div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>HHEE por Día de Semana</h3>
            <div style={{ position: 'relative', height: '300px', overflow: 'hidden' }}>
              <Bar data={chartPorDia} options={chartOptionsSinLeyenda} />
            </div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee', gridColumn: '1 / -1' }}>
            <h3>Concentración de HHEE por Hora del Día</h3>
            <p style={{ fontSize: '12px', color: '#999', margin: '0 0 12px' }}>Basado en la hora de inicio de cada registro</p>
            <div style={{ position: 'relative', height: '280px', overflow: 'hidden' }}>
              <Bar data={chartPorHora} options={chartOptionsSinLeyenda} />
            </div>
          </div>
        </div>
      )}

      {/* Tab: Por Persona */}
      {activeTab === 'persona' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
          <h3>Top Especialistas - HHEE</h3>
          <div style={{ position: 'relative', height: '400px', overflow: 'hidden' }}>
            <Bar data={chartTopEspecialistas} options={{ ...chartOptionsSinLeyenda, indexAxis: 'y' }} />
          </div>
        </div>
      )}

      {/* Tab: Por Área */}
      {activeTab === 'area' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
          <h3>Desglose por Especialidad</h3>
          <table style={{ width: '100%', marginTop: '15px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '10px', textAlign: 'left', fontWeight: 'bold' }}>Especialidad</th>
                <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>Horas</th>
                <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>% del Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(datos.porEspecialidad)
                .sort((a, b) => b[1] - a[1])
                .map(([especialidad, horas]) => (
                  <tr key={especialidad} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px' }}>{especialidad}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{horas.toFixed(1)}h</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {((horas / datos.total) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: IA Insights */}
      {activeTab === 'ia-insights' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
          <h3>🤖 Análisis Inteligente</h3>
          
          {/* Info de descartados */}
          {discardedInsights.length > 0 && (
            <div style={{
              background: '#e3f2fd',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '15px',
              fontSize: '12px',
              color: '#1565c0',
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
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}
              >
                🔄 Limpiar Historial
              </button>
            </div>
          )}
          
          {loading && (
            <p style={{ color: '#666', fontStyle: 'italic' }}>⏳ Analizando datos con IA...</p>
          )}
          {error && (
            <p style={{ color: '#e24b4a', fontStyle: 'italic' }}>❌ {error}</p>
          )}
          {insights && (
            <div>
              <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', color: '#333', background: '#f9f9f9', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
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
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
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
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
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
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              🚀 Generar Análisis IA
            </button>
          )}
        </div>
      )}

      {/* Tab: Agrupación IA */}
      {activeTab === 'ia-agrupacion' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
          <h3 style={{ marginTop: 0, color: '#1f2937' }}>🔍 Agrupación por Tipo de Actividad (IA)</h3>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
            La IA lee todas las descripciones de los registros aprobados, las agrupa por categorías de actividad, detecta cuáles se repiten más y cuáles generan más tiempo.
          </p>

          {/* Controles */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', background: '#f9fafb', padding: '14px', borderRadius: '8px', marginBottom: '20px' }}>
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
                color: 'white', border: 'none', borderRadius: '8px',
                cursor: loadingAgrupacion ? 'not-allowed' : 'pointer',
                fontWeight: '700', fontSize: '13px'
              }}
            >
              {loadingAgrupacion ? '⏳ Analizando...' : '🔍 Analizar Descripciones'}
            </button>
            {agrupacion && (
              <button
                onClick={() => setAgrupacion(null)}
                style={{ padding: '10px 14px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
              >
                🔄 Nueva Consulta
              </button>
            )}
          </div>

          {errorAgrupacion && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '14px', color: '#991b1b', fontSize: '13px', marginBottom: '16px' }}>
              ❌ {errorAgrupacion}
            </div>
          )}

          {loadingAgrupacion && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🤖</div>
              <p style={{ fontWeight: '600' }}>La IA está leyendo y agrupando las descripciones...</p>
              <p style={{ fontSize: '12px' }}>Esto puede tomar unos segundos según la cantidad de registros.</p>
            </div>
          )}

          {agrupacion && (
            <>
              {/* Resumen ejecutivo */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '18px', marginBottom: '24px' }}>
                <div style={{ fontWeight: '700', color: '#1e40af', marginBottom: '8px' }}>📋 Resumen Ejecutivo</div>
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
                          <strong style={{ fontSize: '14px' }}>{grupo.nombre}</strong>
                          <span style={{ fontSize: '11px', opacity: 0.9 }}>{tendenciaIcon} {grupo.tendencia}</span>
                        </div>
                        <div style={{ fontSize: '11.5px', opacity: 0.85, marginTop: '4px' }}>{grupo.descripcion}</div>
                      </div>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px', textAlign: 'center' }}>
                          <div style={{ background: `${color}10`, borderRadius: '6px', padding: '8px' }}>
                            <div style={{ fontSize: '18px', fontWeight: '800', color }}>{grupo.horas?.toFixed(1)}h</div>
                            <div style={{ fontSize: '10px', color: '#6b7280' }}>Horas</div>
                          </div>
                          <div style={{ background: `${color}10`, borderRadius: '6px', padding: '8px' }}>
                            <div style={{ fontSize: '18px', fontWeight: '800', color }}>{grupo.registros}</div>
                            <div style={{ fontSize: '10px', color: '#6b7280' }}>Registros</div>
                          </div>
                          <div style={{ background: `${color}10`, borderRadius: '6px', padding: '8px' }}>
                            <div style={{ fontSize: '18px', fontWeight: '800', color }}>{grupo.porcentaje?.toFixed(1)}%</div>
                            <div style={{ fontSize: '10px', color: '#6b7280' }}>Del total</div>
                          </div>
                        </div>
                        {grupo.actividades_frecuentes?.length > 0 && (
                          <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '5px' }}>Actividades más frecuentes:</div>
                            {grupo.actividades_frecuentes.map((act, i) => (
                              <div key={i} style={{ fontSize: '11.5px', color: '#6b7280', padding: '2px 0' }}>· {act}</div>
                            ))}
                          </div>
                        )}
                        {grupo.recomendacion && (
                          <div style={{ background: '#f9fafb', borderLeft: `3px solid ${color}`, padding: '8px 10px', borderRadius: '0 6px 6px 0', fontSize: '11.5px', color: '#374151' }}>
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
            <div style={{ textAlign: 'center', padding: '50px', color: '#9ca3af' }}>
              <div style={{ fontSize: '48px', marginBottom: '14px' }}>🔍</div>
              <p style={{ fontSize: '14px', fontWeight: '600' }}>Selecciona el período y haz clic en "Analizar Descripciones"</p>
              <p style={{ fontSize: '12px' }}>La IA agrupará automáticamente tus actividades en categorías y te dirá cuáles consumen más tiempo y se repiten más.</p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '30px', padding: '15px', background: '#f9f9f9', borderRadius: '8px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
        📊 Datos actualizados al momento • Período: {new Date(2024, filtroMes - 1).toLocaleString('es-CL', { month: 'long' })} {filtroAnio}{filtroEmpresa !== 'todas' ? ` • Empresa: ${filtroEmpresa}` : ''}
      </div>
    </div>
  );
};

export default Analytics;
