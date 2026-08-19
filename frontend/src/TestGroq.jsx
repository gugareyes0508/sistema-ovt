import React, { useState, useEffect } from 'react';
import { llamarGroq, listarModelosDisponibles } from './utils/groqClient';

const TestGroq = () => {
  const [respuesta, setRespuesta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [modeloUsado, setModeloUsado] = useState('');
  const [modelosDisponibles, setModelosDisponibles] = useState(null);
  const [cargandoLista, setCargandoLista] = useState(true);

  // Al entrar a la pantalla, consultamos a GROQ qué modelos están activos
  // AHORA MISMO — no hay lista fija que se pueda quedar vieja.
  useEffect(() => {
    listarModelosDisponibles()
      .then(setModelosDisponibles)
      .catch(() => setModelosDisponibles([]))
      .finally(() => setCargandoLista(false));
  }, []);

  const probarGroq = async () => {
    setCargando(true);
    setError('');
    setRespuesta('');
    setModeloUsado('');
    try {
      const data = await llamarGroq(
        [{ role: 'user', content: '¿Cuál es el propósito principal de las horas extra en una empresa? Responde en 2-3 líneas.' }],
        { temperature: 0.7, maxTokens: 200 }
      );
      setRespuesta(data.choices[0].message.content);
      setModeloUsado(data.model || '(desconocido)');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ padding: '30px', maxWidth: '700px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ margin: '0 0 10px', color: '#333', fontSize: '24px' }}>🧪 Test GROQ API</h2>
        <p style={{ margin: '0', color: '#999', fontSize: '13px' }}>Auto-detección de modelo disponible (consulta en vivo a GROQ)</p>
      </div>

      <div style={{
        padding: '15px', background: '#e3f2fd', borderRadius: '6px', border: '1px solid #90caf9',
        fontSize: '12px', color: '#1565c0', lineHeight: '1.6', marginBottom: '20px'
      }}>
        <p style={{ margin: '0 0 10px', fontWeight: 'bold' }}>⚙️ Cómo funciona:</p>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>Consulta a GROQ (endpoint /models) qué modelos están activos hoy</li>
          <li>Usa automáticamente el más capaz disponible</li>
          <li>Si Groq apaga un modelo, esta pantalla lo detecta sola — no requiere tocar código</li>
        </ul>
      </div>

      <button
        onClick={probarGroq}
        disabled={cargando}
        style={{
          width: '100%', padding: '14px', background: cargando ? '#ccc' : '#FF6B6B', color: 'white',
          border: 'none', borderRadius: '6px', cursor: cargando ? 'not-allowed' : 'pointer',
          fontSize: '15px', fontWeight: 'bold', transition: 'all 0.3s', marginBottom: '20px'
        }}
      >
        {cargando ? <>⏳ Probando...</> : <>🚀 Llamar a GROQ (Auto-detección)</>}
      </button>

      {modeloUsado && (
        <div style={{ padding: '12px', background: '#e8f5e9', borderRadius: '6px', border: '1px solid #4caf50', marginBottom: '15px', fontSize: '12px', color: '#2e7d32', fontWeight: 'bold' }}>
          ✅ Modelo usado: <span style={{ fontFamily: 'monospace' }}>{modeloUsado}</span>
        </div>
      )}

      {error && (
        <div style={{ padding: '15px', background: '#ffebee', color: '#c62828', borderRadius: '6px', border: '1px solid #ef5350', marginBottom: '20px', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 'bold' }}>❌ Error</p>
          {error}
        </div>
      )}

      {respuesta && (
        <div style={{ padding: '15px', background: '#e8f5e9', borderRadius: '6px', border: '1px solid #4caf50', marginBottom: '20px' }}>
          <p style={{ margin: '0 0 10px', fontWeight: 'bold', color: '#2e7d32', fontSize: '13px' }}>✅ Respuesta de GROQ:</p>
          <div style={{ padding: '12px', background: 'white', borderRadius: '4px', fontSize: '13px', lineHeight: '1.6', color: '#333', border: '1px solid #c8e6c9' }}>
            {respuesta}
          </div>
        </div>
      )}

      <div style={{ padding: '15px', background: '#f5f5f5', borderRadius: '6px', border: '1px solid #ddd', fontSize: '12px', color: '#666' }}>
        <p style={{ margin: '0 0 10px', fontWeight: 'bold' }}>📋 Modelos activos hoy en GROQ (en vivo):</p>
        {cargandoLista ? (
          <p style={{ margin: 0, color: '#999' }}>Consultando...</p>
        ) : modelosDisponibles && modelosDisponibles.length > 0 ? (
          <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.8' }}>
            {modelosDisponibles.map((m, i) => (
              <div key={m.id} style={{ padding: '4px 0', color: i === 0 ? '#2e7d32' : '#999', fontWeight: i === 0 ? 'bold' : 'normal' }}>
                {i + 1}. {m.id} {i === 0 && '← se usará este'} <span style={{ color: '#bbb' }}>(contexto: {m.context_window?.toLocaleString() || '?'})</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: '#c62828' }}>No se pudo consultar la lista (revisa la API key).</p>
        )}
      </div>

      <div style={{ marginTop: '20px', padding: '12px', background: '#f9f9f9', borderRadius: '4px', fontSize: '11px', color: '#999', fontFamily: 'monospace', border: '1px solid #ddd' }}>
        <p style={{ margin: '0 0 8px' }}>🔧 Debug:</p>
        <p style={{ margin: '0' }}>API Key cargada: {process.env.REACT_APP_GROQ_API_KEY ? '✅ Sí' : '❌ No'}</p>
      </div>
    </div>
  );
};

export default TestGroq;
