import React, { useState, useEffect, useCallback } from 'react';
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

const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const Analytics = ({ registros = [], usuarios = [], token }) => {
  const [activeTab, setActiveTab] = useState('resumen');
  const [mesFiltro, setMesFiltro] = useState(new Date().getMonth() + 1);
  const [anioFiltro, setAnioFiltro] = useState(new Date().getFullYear());
  
  // Estados para insights automáticos
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [errorInsights, setErrorInsights] = useState(null);
  
  // Estados para preguntas personalizadas
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState(null);
  const [cargandoPregunta, setCargandoPregunta] = useState(false);
  const [historicoPreguntas, setHistoricoPreguntas] = useState([]);

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

  const procesarDatos = useCallback(() => {
    if (!registros || registros.length === 0) {
      return {
        total: 0,
        porTipo: { cambios: 0, alertas: 0 },
        porEspecialidad: {},
        porPersona: {},
        porSemana: {},
        porDia: {}
      };
    }

    let registrosFiltrados = registros.filter(r => {
      const fecha = toDate(r.fechaInicio);
      return fecha.getMonth() === mesFiltro - 1 && 
             fecha.getFullYear() === anioFiltro && 
             r.estado === 'exitoso';
    });

    const datos = {
      total: registrosFiltrados.reduce((sum, r) => sum + (r.horas || 0), 0),
      porTipo: { cambios: 0, alertas: 0 },
      porEspecialidad: {},
      porPersona: {},
      porSemana: {},
      porDia: { 'Lun': 0, 'Mar': 0, 'Mié': 0, 'Jue': 0, 'Vie': 0, 'Sab': 0, 'Dom': 0 },
      registrosFiltrados: registrosFiltrados,
      mesFiltro,
      anioFiltro
    };

    registrosFiltrados.forEach(r => {
      const horas = r.horas || 0;
      const fecha = toDate(r.fechaInicio);

      if (r.tipo === 'cambio') datos.porTipo.cambios += horas;
      else if (r.tipo === 'alerta') datos.porTipo.alertas += horas;

      const especialidad = r.especialidad || 'Sin especialidad';
      datos.porEspecialidad[especialidad] = (datos.porEspecialidad[especialidad] || 0) + horas;

      const persona = r.createdByNombre || r.especialista || 'Sin especialista';
      datos.porPersona[persona] = (datos.porPersona[persona] || 0) + horas;

      const numeroSemana = getWeekNumber(fecha);
      const semanaKey = `S${numeroSemana}`;
      datos.porSemana[semanaKey] = (datos.porSemana[semanaKey] || 0) + horas;

      const dia = fecha.getDay();
      const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sab'];
      datos.porDia[diasNombres[dia]] = (datos.porDia[diasNombres[dia]] || 0) + horas;
    });

    return datos;
  }, [registros, mesFiltro, anioFiltro]);

  const generarInsights = useCallback(async () => {
    setLoadingInsights(true);
    setErrorInsights(null);

    try {
      const datos = procesarDatos();
      
      const prompt = `Analiza estos datos de horas extra de Kyndryl Chile (${datos.mesFiltro}/${datos.anioFiltro}) y genera insights en formato:

Total HHEE: ${datos.total.toFixed(2)}h
Cambios: ${datos.porTipo.cambios.toFixed(2)}h
Alertas: ${datos.porTipo.alertas.toFixed(2)}h

Por Especialidad: ${JSON.stringify(datos.porEspecialidad)}
Top Especialistas: ${JSON.stringify(Object.entries(datos.porPersona).sort((a, b) => b[1] - a[1]).slice(0, 5))}

Formato de respuesta:
**1. [INSIGHT]** - Descripción corta
**2. [ALERTA]** - Anomalía detectada
**3. [RECOMENDACIÓN]** - Acción sugerida
**4. [INSIGHT]** - Otro patrón importante
**5. [ALERTA]** - Otro problema si existe
**6. [RECOMENDACIÓN]** - Otra recomendación

Sé conciso y específico. Responde en español.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1200
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error('Error en GROQ: ' + (errorData.error?.message || response.statusText));
      }

      const data = await response.json();
      const respuestaTexto = data.choices[0].message.content;
      setInsights(respuestaTexto);
    } catch (err) {
      setErrorInsights('Error generando insights: ' + err.message);
      console.error(err);
    } finally {
      setLoadingInsights(false);
    }
  }, [procesarDatos]);

  const responderPregunta = useCallback(async () => {
    if (!pregunta.trim()) return;
    
    setCargandoPregunta(true);
    try {
      const datos = procesarDatos();
      
      const contexto = `Contexto de datos (${datos.mesFiltro}/${datos.anioFiltro}):
- Total HHEE: ${datos.total.toFixed(2)}h
- Cambios: ${datos.porTipo.cambios.toFixed(2)}h | Alertas: ${datos.porTipo.alertas.toFixed(2)}h
- Por Especialidad: ${JSON.stringify(datos.porEspecialidad)}
- Top Especialistas: ${JSON.stringify(Object.entries(datos.porPersona).sort((a, b) => b[1] - a[1]).slice(0, 10))}
- Horas por Día: ${JSON.stringify(datos.porDia)}

Pregunta del usuario: ${pregunta}

Responde de forma concisa y basada únicamente en los datos proporcionados.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: contexto }],
          temperature: 0.5,
          max_tokens: 600
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || response.statusText);
      }

      const data = await response.json();
      const textoRespuesta = data.choices[0].message.content;
      
      const nuevaRespuesta = {
        pregunta: pregunta,
        respuesta: textoRespuesta,
        timestamp: new Date()
      };
      
      setRespuesta(nuevaRespuesta);
      setHistoricoPreguntas([nuevaRespuesta, ...historicoPreguntas]);
      setPregunta('');
    } catch (err) {
      setRespuesta({
        pregunta: pregunta,
        respuesta: `❌ Error: ${err.message}`,
        timestamp: new Date()
      });
      console.error(err);
    } finally {
      setCargandoPregunta(false);
    }
  }, [pregunta, procesarDatos, historicoPreguntas]);

  useEffect(() => {
    if (activeTab === 'ia-insights' && !insights && !loadingInsights) {
      generarInsights();
    }
  }, [activeTab, insights, loadingInsights, generarInsights]);

  const datos = procesarDatos();
  const colores = ['#3266ad', '#e24b4a', '#73726c', '#ba7517', '#1d9e75'];

  // Gráficos
  const chartPorTipo = {
    labels: ['Cambios', 'Alertas'],
    datasets: [{
      data: [datos.porTipo.cambios, datos.porTipo.alertas],
      backgroundColor: ['#3266ad', '#e24b4a'],
      borderColor: ['#3266ad', '#e24b4a'],
      borderWidth: 2
    }]
  };

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

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
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

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>📊 Analytics - Análisis de HHEE</h2>

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
          <p style={{ margin: 0, fontSize: '12px', color: '#666', fontWeight: 'bold' }}>Registros</p>
          <p style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 'bold', color: '#1d9e75' }}>{datos.registrosFiltrados.length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#666' }}>Mes</label>
          <select
            value={mesFiltro}
            onChange={(e) => setMesFiltro(parseInt(e.target.value))}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '13px' }}
          >
            {[...Array(12)].map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2024, i).toLocaleString('es-CL', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#666' }}>Año</label>
          <select
            value={anioFiltro}
            onChange={(e) => setAnioFiltro(parseInt(e.target.value))}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '13px' }}
          >
            {[2023, 2024, 2025, 2026, 2027].map(año => (
              <option key={año} value={año}>{año}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #ddd', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[
          { id: 'resumen', label: '📊 Resumen' },
          { id: 'tendencias', label: '📈 Tendencias' },
          { id: 'persona', label: '👥 Por Persona' },
          { id: 'area', label: '🏢 Por Área' },
          { id: 'ia-insights', label: '🤖 IA Insights' }
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>HHEE por Tipo</h3>
            <div style={{ position: 'relative', height: '250px' }}>
              <Doughnut data={chartPorTipo} options={chartOptions} />
            </div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>HHEE por Especialidad</h3>
            <div style={{ position: 'relative', height: '250px' }}>
              <Bar data={chartPorEspecialidad} options={chartOptions} />
            </div>
          </div>
        </div>
      )}

      {/* Tab: Tendencias */}
      {activeTab === 'tendencias' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>Evolución Semana a Semana</h3>
            <div style={{ position: 'relative', height: '300px' }}>
              <Line data={chartSemanal} options={chartOptions} />
            </div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>HHEE por Día de Semana</h3>
            <div style={{ position: 'relative', height: '300px' }}>
              <Bar data={chartPorDia} options={chartOptions} />
            </div>
          </div>
        </div>
      )}

      {/* Tab: Por Persona */}
      {activeTab === 'persona' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
          <h3>Top Especialistas - HHEE</h3>
          <div style={{ position: 'relative', height: '400px' }}>
            <Bar data={chartTopEspecialistas} options={{ ...chartOptions, indexAxis: 'y' }} />
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
          {/* Sección 1: Análisis Automático */}
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🤖 Análisis Automático</span>
            </h3>
            {loadingInsights && (
              <p style={{ color: '#666', fontStyle: 'italic' }}>Analizando datos con IA...</p>
            )}
            {errorInsights && (
              <p style={{ color: '#e24b4a', fontStyle: 'italic' }}>{errorInsights}</p>
            )}
            {insights && (
              <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', color: '#333', background: '#f9f9f9', padding: '15px', borderRadius: '4px' }}>
                {insights}
              </div>
            )}
            {!loadingInsights && !insights && !errorInsights && (
              <button
                onClick={generarInsights}
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
                Generar Análisis
              </button>
            )}
          </div>

          {/* Sección 2: Preguntas Personalizadas */}
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '2px solid #3266ad' }}>
            <h3 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#3266ad' }}>
              ❓ Haz tu pregunta
            </h3>
            <p style={{ fontSize: '13px', color: '#666', margin: '0 0 12px 0' }}>
              Consulta a la IA sobre patrones específicos en tus datos
            </p>
            
            <textarea
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  responderPregunta();
                }
              }}
              placeholder="Ej: ¿Cuál es el especialista con más cambios? ¿En qué día hay más alertas? ¿Cuál es la especialidad con menor carga?"
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: '14px',
                marginBottom: '12px',
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
            />
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={responderPregunta}
                disabled={cargandoPregunta || !pregunta.trim()}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: cargandoPregunta ? '#ccc' : '#3266ad',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: cargandoPregunta ? 'not-allowed' : 'pointer'
                }}
              >
                {cargandoPregunta ? '⏳ Procesando...' : '📨 Enviar Pregunta (Ctrl+Enter)'}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: '#999', margin: '8px 0 0 0' }}>
              Tip: Puedes presionar Ctrl+Enter para enviar
            </p>
          </div>

          {/* Sección 3: Respuestas */}
          {respuesta && (
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
              <div style={{ background: '#f0f7ff', padding: '15px', borderRadius: '6px', borderLeft: '3px solid #3266ad' }}>
                <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#3266ad', fontSize: '13px' }}>
                  Tu pregunta: {respuesta.pregunta}
                </p>
                <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                  {respuesta.respuesta}
                </div>
              </div>
            </div>
          )}

          {/* Histórico de Preguntas */}
          {historicoPreguntas.length > 0 && (
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#666' }}>📜 Histórico de Preguntas</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {historicoPreguntas.slice(0, 5).map((item, idx) => (
                  <div key={idx} style={{ padding: '12px', background: '#f9f9f9', borderRadius: '4px', borderLeft: '3px solid #3266ad' }}>
                    <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', fontSize: '12px', color: '#3266ad' }}>
                      {item.pregunta}
                    </p>
                    <p style={{ margin: '0', fontSize: '12px', color: '#666', lineHeight: '1.6' }}>
                      {item.respuesta.substring(0, 200)}...
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '30px', padding: '15px', background: '#f9f9f9', borderRadius: '8px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
        📊 Datos actualizados al momento • Mes: {mesFiltro}/{anioFiltro} • Período: últimas 4 semanas
      </div>
    </div>
  );
};

export default Analytics;
