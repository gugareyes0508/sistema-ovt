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

// Función auxiliar fuera del componente
const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const Analytics = ({ registros = [], usuarios = [], token }) => {
  const [activeTab, setActiveTab] = useState('resumen');
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mesFiltro, setMesFiltro] = useState(new Date().getMonth() + 1);
  const [anioFiltro, setAnioFiltro] = useState(new Date().getFullYear());

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

    // Filtrar por mes y año seleccionados
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
    });

    return datos;
  }, [registros, mesFiltro, anioFiltro]);

  // Generar Insights con IA (GROQ)
  const generarInsights = useCallback(async () => {
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
  }, [procesarDatos]);

  useEffect(() => {
    if (activeTab === 'ia-insights' && !insights && !loading) {
      generarInsights();
    }
  }, [activeTab, insights, loading, generarInsights]);

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
        labels: { 
          padding: 20, 
          font: { size: 13, weight: 'bold' },
          boxWidth: 15,
          usePointStyle: false
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 12,
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 12 },
        cornerRadius: 6
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.08)' },
        ticks: { font: { size: 12 }, padding: 10 }
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 12 }, padding: 10 }
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
      <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap', background: '#f9f9f9', padding: '15px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Mes</label>
          <select
            value={mesFiltro}
            onChange={(e) => setMesFiltro(parseInt(e.target.value))}
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
              minWidth: '150px'
            }}
          >
            {[...Array(12)].map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2024, i).toLocaleString('es-CL', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Año</label>
          <select
            value={anioFiltro}
            onChange={(e) => setAnioFiltro(parseInt(e.target.value))}
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
              minWidth: '150px'
            }}
          >
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
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
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
            {/* Gráfico 1: Dona */}
            <div style={{ background: 'white', padding: '25px', borderRadius: '10px', border: '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <h3 style={{ margin: '0 0 25px 0', color: '#333', fontSize: '16px', fontWeight: '600', textAlign: 'center' }}>📊 HHEE por Tipo</h3>
              <div style={{ position: 'relative', height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Doughnut data={chartPorTipo} options={{...chartOptions, maintainAspectRatio: false}} />
              </div>
            </div>

            {/* Gráfico 2: Barras */}
            <div style={{ background: 'white', padding: '25px', borderRadius: '10px', border: '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <h3 style={{ margin: '0 0 25px 0', color: '#333', fontSize: '16px', fontWeight: '600', textAlign: 'center' }}>📈 HHEE por Especialidad</h3>
              <div style={{ position: 'relative', height: '320px' }}>
                <Bar data={chartPorEspecialidad} options={{...chartOptions, maintainAspectRatio: false}} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Tendencias */}
      {activeTab === 'tendencias' && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
            {/* Gráfico Linea */}
            <div style={{ background: 'white', padding: '25px', borderRadius: '10px', border: '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <h3 style={{ margin: '0 0 25px 0', color: '#333', fontSize: '16px', fontWeight: '600', textAlign: 'center' }}>📈 Evolución Semana a Semana</h3>
              <div style={{ position: 'relative', height: '340px' }}>
                <Line data={chartSemanal} options={{...chartOptions, maintainAspectRatio: false}} />
              </div>
            </div>

            {/* Gráfico Barras Día */}
            <div style={{ background: 'white', padding: '25px', borderRadius: '10px', border: '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <h3 style={{ margin: '0 0 25px 0', color: '#333', fontSize: '16px', fontWeight: '600', textAlign: 'center' }}>📊 HHEE por Día de Semana</h3>
              <div style={{ position: 'relative', height: '340px' }}>
                <Bar data={chartPorDia} options={{...chartOptions, maintainAspectRatio: false}} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Por Persona */}
      {activeTab === 'persona' && (
        <div style={{ background: 'white', padding: '25px', borderRadius: '10px', border: '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginTop: '20px' }}>
          <h3 style={{ margin: '0 0 25px 0', color: '#333', fontSize: '16px', fontWeight: '600', textAlign: 'center' }}>👥 Top 10 Especialistas - HHEE</h3>
          <div style={{ position: 'relative', height: '480px' }}>
            <Bar data={chartTopEspecialistas} options={{ ...chartOptions, indexAxis: 'y', maintainAspectRatio: false }} />
          </div>
        </div>
      )}

      {/* Tab: Por Área */}
      {activeTab === 'area' && (
        <div style={{ background: 'white', padding: '25px', borderRadius: '10px', border: '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginTop: '20px' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#333', fontSize: '16px', fontWeight: '600' }}>🏢 Desglose por Especialidad</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '15px', textAlign: 'left', fontWeight: '600', color: '#333' }}>Especialidad</th>
                <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#333' }}>Horas</th>
                <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#333' }}>% del Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(datos.porEspecialidad)
                .sort((a, b) => b[1] - a[1])
                .map(([especialidad, horas], idx) => (
                  <tr key={especialidad} style={{ borderBottom: '1px solid #eee', background: idx % 2 === 0 ? '#fafafa' : 'white' }}>
                    <td style={{ padding: '15px', color: '#333' }}><strong>{especialidad}</strong></td>
                    <td style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#2196F3' }}>{horas.toFixed(1)}h</td>
                    <td style={{ padding: '15px', textAlign: 'right', color: '#666' }}>
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
        <div style={{ background: 'white', padding: '25px', borderRadius: '10px', border: '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginTop: '20px' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#333', fontSize: '16px', fontWeight: '600' }}>🤖 Análisis Inteligente con IA</h3>
          {loading && (
            <p style={{ color: '#2196F3', fontStyle: 'italic', fontSize: '14px' }}>⏳ Analizando datos con IA GROQ...</p>
          )}
          {error && (
            <p style={{ color: '#e24b4a', fontStyle: 'italic', fontSize: '14px' }}>❌ {error}</p>
          )}
          {insights && (
            <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.8', color: '#333', background: '#f0f7ff', padding: '20px', borderRadius: '8px', border: '1px solid #e3f2fd' }}>
              {insights}
            </div>
          )}
          {!loading && !insights && !error && (
            <button
              onClick={generarInsights}
              style={{
                padding: '12px 24px',
                background: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.3s'
              }}
              onMouseOver={(e) => e.target.style.background = '#1976D2'}
              onMouseOut={(e) => e.target.style.background = '#2196F3'}
            >
              🚀 Generar Análisis con IA
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
