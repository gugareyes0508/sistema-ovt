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

  // Procesar datos
  const procesarDatos = () => {
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

    const hoy = new Date();
    const hace4Semanas = new Date(hoy.getTime() - 28 * 24 * 60 * 60 * 1000);

    let registrosFiltrados = registros.filter(r => {
      const fecha = toDate(r.fechaInicio);
      return fecha >= hace4Semanas && fecha <= hoy && r.estado === 'exitoso';
    });

    const datos = {
      total: registrosFiltrados.reduce((sum, r) => sum + (r.horas || 0), 0),
      porTipo: { cambios: 0, alertas: 0 },
      porEspecialidad: {},
      porPersona: {},
      porSemana: {},
      porDia: { 'Lun': 0, 'Mar': 0, 'Mié': 0, 'Jue': 0, 'Vie': 0, 'Sab': 0, 'Dom': 0 },
      registrosFiltrados: registrosFiltrados
    };

    registrosFiltrados.forEach(r => {
      const horas = r.horas || 0;
      const fecha = toDate(r.fechaInicio);

      // Por Tipo
      if (r.tipo === 'cambio') datos.porTipo.cambios += horas;
      else if (r.tipo === 'alerta') datos.porTipo.alertas += horas;

      // Por Especialidad
      const especialidad = r.especialidad || 'Sin especialidad';
      datos.porEspecialidad[especialidad] = (datos.porEspecialidad[especialidad] || 0) + horas;

      // Por Persona
      const persona = r.especialista || 'Sin especialista';
      datos.porPersona[persona] = (datos.porPersona[persona] || 0) + horas;

      // Por Semana
      const numeroSemana = getWeekNumber(fecha);
      const semanaKey = `S${numeroSemana}`;
      datos.porSemana[semanaKey] = (datos.porSemana[semanaKey] || 0) + horas;

      // Por Día
      const dia = fecha.getDay();
      const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sab'];
      datos.porDia[diasNombres[dia]] = (datos.porDia[diasNombres[dia]] || 0) + horas;
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

  // Generar Insights con IA (GROQ)
  const generarInsights = async () => {
    setLoading(true);
    setError(null);

    try {
      const datos = procesarDatos();
      
      const prompt = `Analiza estos datos de horas extra de Kyndryl Chile y genera insights:

Total HHEE: ${datos.total.toFixed(2)}h
Cambios: ${datos.porTipo.cambios.toFixed(2)}h (${((datos.porTipo.cambios / datos.total) * 100).toFixed(1)}%)
Alertas: ${datos.porTipo.alertas.toFixed(2)}h (${((datos.porTipo.alertas / datos.total) * 100).toFixed(1)}%)

Por Especialidad: ${JSON.stringify(datos.porEspecialidad)}
Top Especialistas: ${JSON.stringify(Object.entries(datos.porPersona).sort((a, b) => b[1] - a[1]).slice(0, 5))}
Por Día de Semana: ${JSON.stringify(datos.porDia)}

Genera un análisis en formato:
1. [INSIGHT] - Descripción corta (máx 80 caracteres)
2. [ALERTA] - Anomalía detectada (si aplica)
3. [RECOMENDACIÓN] - Acción sugerida

Sé conciso y específico.`;

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
          temperature: 0.7,
          max_tokens: 1000
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
      setError('Error generando insights: ' + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'ia-insights' && !insights && !loading) {
      generarInsights();
    }
  }, [activeTab, insights, loading]);

  const datos = procesarDatos();

  // Colores para gráficos
  const colores = ['#3266ad', '#e24b4a', '#73726c', '#ba7517', '#1d9e75'];

  // Gráfico Por Tipo
  const chartPorTipo = {
    labels: ['Cambios', 'Alertas'],
    datasets: [{
      data: [datos.porTipo.cambios, datos.porTipo.alertas],
      backgroundColor: ['#3266ad', '#e24b4a'],
      borderColor: ['#3266ad', '#e24b4a'],
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

  // Opciones comunes para gráficos
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
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
          <h3>🤖 Análisis Inteligente</h3>
          {loading && (
            <p style={{ color: '#666', fontStyle: 'italic' }}>⏳ Analizando datos con IA...</p>
          )}
          {error && (
            <p style={{ color: '#e24b4a', fontStyle: 'italic' }}>❌ {error}</p>
          )}
          {insights && (
            <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', color: '#333', background: '#f9f9f9', padding: '15px', borderRadius: '6px' }}>
              {insights}
            </div>
          )}
          {!loading && !insights && !error && (
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
              🚀 Generar Análisis IA
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '30px', padding: '15px', background: '#f9f9f9', borderRadius: '8px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
        📊 Datos actualizados al momento • Último período: últimas 4 semanas
      </div>
    </div>
  );
};

export default Analytics;
