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
  
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [errorInsights, setErrorInsights] = useState(null);
  
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
      
      const prompt = `Analiza estos datos de horas extra de Kyndryl Chile (${datos.mesFiltro}/${datos.anioFiltro}):
Total: ${datos.total.toFixed(2)}h | Cambios: ${datos.porTipo.cambios.toFixed(2)}h | Alertas: ${datos.porTipo.alertas.toFixed(2)}h
Especialidades: ${JSON.stringify(datos.porEspecialidad)}
Top 5: ${JSON.stringify(Object.entries(datos.porPersona).sort((a, b) => b[1] - a[1]).slice(0, 5))}

Genera 6 insights alternados: **[INSIGHT]** descripción, **[ALERTA]** problema, **[RECOMENDACIÓN]** acción. Sé conciso.`;

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
          max_tokens: 1000
        })
      });

      if (!response.ok) throw new Error('Error en GROQ');
      const data = await response.json();
      setInsights(data.choices[0].message.content);
    } catch (err) {
      setErrorInsights('Error: ' + err.message);
    } finally {
      setLoadingInsights(false);
    }
  }, [procesarDatos]);

  const responderPregunta = useCallback(async () => {
    if (!pregunta.trim()) return;
    setCargandoPregunta(true);
    try {
      const datos = procesarDatos();
      const contexto = `Datos (${datos.mesFiltro}/${datos.anioFiltro}): Total=${datos.total.toFixed(1)}h, Cambios=${datos.porTipo.cambios.toFixed(1)}h, Alertas=${datos.porTipo.alertas.toFixed(1)}h
Especialidades: ${JSON.stringify(datos.porEspecialidad)}
Top especialistas: ${JSON.stringify(Object.entries(datos.porPersona).sort((a, b) => b[1] - a[1]).slice(0, 10))}
Pregunta: ${pregunta}`;

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
          max_tokens: 500
        })
      });

      if (!response.ok) throw new Error('Error en API');
      const data = await response.json();
      const nuevaRespuesta = { pregunta, respuesta: data.choices[0].message.content };
      setRespuesta(nuevaRespuesta);
      setHistoricoPreguntas([nuevaRespuesta, ...historicoPreguntas]);
      setPregunta('');
    } catch (err) {
      setRespuesta({ pregunta, respuesta: `❌ Error: ${err.message}` });
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

  const chartPorTipo = {
    labels: ['Cambios', 'Alertas'],
    datasets: [{
      data: [datos.porTipo.cambios, datos.porTipo.alertas],
      backgroundColor: ['#3266ad', '#e24b4a'],
      borderColor: ['#3266ad', '#e24b4a'],
      borderWidth: 2
    }]
  };

  const especialidades = Object.keys(datos.porEspecialidad).sort((a, b) => datos.porEspecialidad[b] - datos.porEspecialidad[a]);
  const chartPorEspecialidad = {
    labels: especialidades,
    datasets: [{ label: 'Horas', data: especialidades.map(e => datos.porEspecialidad[e]), backgroundColor: colores, borderColor: colores, borderWidth: 1 }]
  };

  const topEspecialistas = Object.entries(datos.porPersona).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const chartTopEspecialistas = {
    labels: topEspecialistas.map(e => e[0]),
    datasets: [{ label: 'Horas', data: topEspecialistas.map(e => e[1]), backgroundColor: colores[0], borderColor: colores[0], borderWidth: 1 }]
  };

  const semanas = Object.keys(datos.porSemana).sort();
  const chartSemanal = {
    labels: semanas,
    datasets: [{ label: 'HHEE', data: semanas.map(s => datos.porSemana[s]), borderColor: '#3266ad', backgroundColor: 'rgba(50, 102, 173, 0.1)', borderWidth: 2, fill: true, tension: 0.4, pointBackgroundColor: '#3266ad', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5 }]
  };

  const diasOrden = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sab', 'Dom'];
  const chartPorDia = {
    labels: diasOrden,
    datasets: [{ label: 'Horas', data: diasOrden.map(d => datos.porDia[d] || 0), backgroundColor: '#ba7517', borderColor: '#ba7517', borderWidth: 1 }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'bottom', labels: { padding: 15, font: { size: 12 } } }, tooltip: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 12, titleFont: { size: 13 }, bodyFont: { size: 12 } } },
    scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } }
  };

  const chartOptionsPie = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'bottom', labels: { padding: 15, font: { size: 12 } } } }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', width: '100%' }}>
      <h2>📊 Analytics - Análisis de HHEE</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '30px' }}>
        {[['Total HHEE', datos.total.toFixed(0) + 'h', '#3266ad'], ['Cambios', datos.porTipo.cambios.toFixed(0) + 'h', '#3266ad'], ['Alertas', datos.porTipo.alertas.toFixed(0) + 'h', '#e24b4a'], ['Registros', datos.registrosFiltrados.length, '#1d9e75']].map((item, idx) => (
          <div key={idx} style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#666', fontWeight: 'bold' }}>{item[0]}</p>
            <p style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 'bold', color: item[2] }}>{item[1]}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#666' }}>Mes</label>
          <select value={mesFiltro} onChange={(e) => setMesFiltro(parseInt(e.target.value))} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '13px' }}>
            {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{new Date(2024, i).toLocaleString('es-CL', { month: 'long' })}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#666' }}>Año</label>
          <select value={anioFiltro} onChange={(e) => setAnioFiltro(parseInt(e.target.value))} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '13px' }}>
            {[2023, 2024, 2025, 2026, 2027].map(año => <option key={año} value={año}>{año}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: '20px', borderBottom: '1px solid #ddd', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[{ id: 'resumen', label: '📊 Resumen' }, { id: 'tendencias', label: '📈 Tendencias' }, { id: 'persona', label: '👥 Por Persona' }, { id: 'area', label: '🏢 Por Área' }, { id: 'ia-insights', label: '🤖 IA Insights' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '10px 15px', border: 'none', background: activeTab === tab.id ? '#3266ad' : 'transparent', color: activeTab === tab.id ? 'white' : '#666', cursor: 'pointer', fontSize: '13px', fontWeight: activeTab === tab.id ? 'bold' : 'normal', borderBottom: activeTab === tab.id ? '3px solid #3266ad' : 'none' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>HHEE por Tipo</h3>
            <div style={{ position: 'relative', height: '320px' }}>
              <Doughnut data={chartPorTipo} options={chartOptionsPie} />
            </div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>HHEE por Especialidad</h3>
            <div style={{ position: 'relative', height: '320px' }}>
              <Bar data={chartPorEspecialidad} options={chartOptions} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tendencias' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>Evolución Semana a Semana</h3>
            <div style={{ position: 'relative', height: '350px' }}>
              <Line data={chartSemanal} options={chartOptions} />
            </div>
          </div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>HHEE por Día de Semana</h3>
            <div style={{ position: 'relative', height: '350px' }}>
              <Bar data={chartPorDia} options={chartOptions} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'persona' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
          <h3>Top Especialistas - HHEE</h3>
          <div style={{ position: 'relative', height: '450px' }}>
            <Bar data={chartTopEspecialistas} options={{ ...chartOptions, indexAxis: 'y' }} />
          </div>
        </div>
      )}

      {activeTab === 'area' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
          <h3>Desglose por Especialidad</h3>
          <table style={{ width: '100%', marginTop: '15px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '10px', textAlign: 'left', fontWeight: 'bold' }}>Especialidad</th>
                <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>Horas</th>
                <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>% Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(datos.porEspecialidad).sort((a, b) => b[1] - a[1]).map(([esp, horas]) => (
                <tr key={esp} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{esp}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{horas.toFixed(1)}h</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{datos.total > 0 ? ((horas / datos.total) * 100).toFixed(1) : '0'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'ia-insights' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3>🤖 Análisis Automático</h3>
            {loadingInsights && <p style={{ color: '#666' }}>Analizando...</p>}
            {errorInsights && <p style={{ color: '#e24b4a' }}>{errorInsights}</p>}
            {insights && <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.6', color: '#333', background: '#f9f9f9', padding: '15px', borderRadius: '4px' }}>{insights}</div>}
            {!loadingInsights && !insights && !errorInsights && <button onClick={generarInsights} style={{ padding: '10px 20px', background: '#3266ad', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Generar Análisis</button>}
          </div>

          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '2px solid #3266ad' }}>
            <h3 style={{ color: '#3266ad' }}>❓ Haz tu pregunta</h3>
            <p style={{ fontSize: '13px', color: '#666' }}>Consulta sobre patrones en tus datos</p>
            <textarea value={pregunta} onChange={(e) => setPregunta(e.target.value)} onKeyPress={(e) => { if (e.key === 'Enter' && e.ctrlKey) responderPregunta(); }} placeholder="Ej: ¿Cuál es el especialista con más cambios?" style={{ width: '100%', minHeight: '80px', padding: '12px', border: '1px solid #ddd', borderRadius: '4px', fontFamily: 'inherit', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' }} />
            <button onClick={responderPregunta} disabled={cargandoPregunta || !pregunta.trim()} style={{ width: '100%', padding: '10px', background: cargandoPregunta ? '#ccc' : '#3266ad', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: cargandoPregunta ? 'not-allowed' : 'pointer' }}>
              {cargandoPregunta ? '⏳ Procesando...' : '📨 Enviar (Ctrl+Enter)'}
            </button>
          </div>

          {respuesta && (
            <div style={{ background: '#f0f7ff', padding: '15px', borderRadius: '8px', borderLeft: '3px solid #3266ad' }}>
              <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#3266ad', fontSize: '13px' }}>Pregunta: {respuesta.pregunta}</p>
              <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.7' }}>{respuesta.respuesta}</div>
            </div>
          )}

          {historicoPreguntas.length > 0 && (
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
              <h4 style={{ margin: 0, marginBottom: '15px', color: '#666' }}>📜 Histórico</h4>
              {historicoPreguntas.slice(0, 5).map((item, idx) => (
                <div key={idx} style={{ padding: '12px', background: '#f9f9f9', borderRadius: '4px', marginBottom: '10px', borderLeft: '3px solid #3266ad' }}>
                  <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', fontSize: '12px', color: '#3266ad' }}>{item.pregunta}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#666', lineHeight: '1.6' }}>{item.respuesta.substring(0, 180)}...</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '30px', padding: '15px', background: '#f9f9f9', borderRadius: '8px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
        📊 {mesFiltro}/{anioFiltro} • {datos.registrosFiltrados.length} registros procesados
      </div>
    </div>
  );
};

export default Analytics;
