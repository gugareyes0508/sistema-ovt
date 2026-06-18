import React, { useState, useEffect } from 'react';

const TestGroq = () => {
  const [respuesta, setRespuesta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [modelo, setModelo] = useState('mixtral-8x7b-32768');
  const [modelosDisponibles, setModelosDisponibles] = useState([
    { id: 'mixtral-8x7b-32768', nombre: 'Mixtral 8x7B' },
    { id: 'llama-3.1-70b-versatile', nombre: 'Llama 3.1 70B' },
    { id: 'llama-3.1-8b-instant', nombre: 'Llama 3.1 8B' },
    { id: 'gemma-2-9b-it', nombre: 'Gemma 2 9B' },
    { id: 'llama-3.2-90b-vision-preview', nombre: 'Llama 3.2 90B Vision' },
    { id: 'llama-3.2-11b-vision-preview', nombre: 'Llama 3.2 11B Vision' }
  ]);

  const llamarGroq = async () => {
    setCargando(true);
    setError('');
    setRespuesta('');

    try {
      console.log('📡 Llamando a GROQ con modelo:', modelo);
      console.log('API Key:', process.env.REACT_APP_GROQ_API_KEY ? '✅ Cargada' : '❌ No cargada');

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: modelo,
          messages: [
            {
              role: 'user',
              content: '¿Cuál es el propósito principal de las horas extra en una empresa? Responde en 2-3 líneas.'
            }
          ],
          temperature: 0.7,
          max_tokens: 200
        })
      });

      console.log('Status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        
        let mensaje = errorData.error?.message || response.statusText;
        
        // Si el modelo fue deprecado, sugerir probar otro
        if (mensaje.includes('decommissioned') || mensaje.includes('deprecated')) {
          mensaje += '\n\n💡 Este modelo fue deprecado. Intenta con otro modelo de la lista.';
        }
        
        throw new Error(`Error ${response.status}: ${mensaje}`);
      }

      const data = await response.json();
      console.log('✅ Respuesta recibida:', data);
      
      const textoRespuesta = data.choices[0].message.content;
      setRespuesta(textoRespuesta);
    } catch (err) {
      console.error('❌ Error completo:', err);
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ padding: '30px', maxWidth: '700px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ margin: '0 0 10px', color: '#333', fontSize: '24px' }}>🧪 Test GROQ API</h2>
        <p style={{ margin: '0', color: '#999', fontSize: '13px' }}>Verifica que la conexión con GROQ funciona correctamente</p>
      </div>

      {/* Selector de Modelo */}
      <div style={{ marginBottom: '20px', padding: '15px', background: '#f9f9f9', borderRadius: '6px', border: '1px solid #ddd' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '13px', color: '#333' }}>
          📌 Selecciona Modelo:
        </label>
        <select 
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            fontSize: '13px',
            fontFamily: 'Arial'
          }}
        >
          {modelosDisponibles.map(m => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>
        <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#999' }}>
          💡 Si un modelo no funciona, intenta con otro
        </p>
      </div>

      {/* Botón Principal */}
      <button 
        onClick={llamarGroq}
        disabled={cargando}
        style={{
          width: '100%',
          padding: '14px',
          background: cargando ? '#ccc' : '#FF6B6B',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: cargando ? 'not-allowed' : 'pointer',
          fontSize: '15px',
          fontWeight: 'bold',
          transition: 'all 0.3s',
          marginBottom: '20px'
        }}
        onMouseOver={(e) => !cargando && (e.target.style.background = '#E63946')}
        onMouseOut={(e) => !cargando && (e.target.style.background = '#FF6B6B')}
      >
        {cargando ? (
          <>⏳ Esperando respuesta de GROQ...</>
        ) : (
          <>🚀 Llamar a GROQ</>
        )}
      </button>

      {/* Error */}
      {error && (
        <div style={{
          padding: '15px',
          background: '#ffebee',
          color: '#c62828',
          borderRadius: '6px',
          border: '1px solid #ef5350',
          marginBottom: '20px',
          fontSize: '13px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap'
        }}>
          <p style={{ margin: '0 0 8px', fontWeight: 'bold' }}>❌ Error</p>
          {error}
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#999' }}>
            💡 Si ves "decommissioned", elige otro modelo de la lista arriba
          </p>
        </div>
      )}

      {/* Respuesta */}
      {respuesta && (
        <div style={{
          padding: '15px',
          background: '#e8f5e9',
          borderRadius: '6px',
          border: '1px solid #4caf50',
          marginBottom: '20px'
        }}>
          <p style={{ margin: '0 0 10px', fontWeight: 'bold', color: '#2e7d32', fontSize: '13px' }}>
            ✅ Respuesta de GROQ (Modelo: {modelo}):
          </p>
          <div style={{
            padding: '12px',
            background: 'white',
            borderRadius: '4px',
            fontSize: '13px',
            lineHeight: '1.6',
            color: '#333',
            border: '1px solid #c8e6c9',
            fontFamily: 'monospace'
          }}>
            {respuesta}
          </div>
        </div>
      )}

      {/* Info */}
      <div style={{
        padding: '15px',
        background: '#e3f2fd',
        borderRadius: '6px',
        border: '1px solid #90caf9',
        fontSize: '12px',
        color: '#1565c0',
        lineHeight: '1.6'
      }}>
        <p style={{ margin: '0 0 10px', fontWeight: 'bold' }}>📌 Información</p>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li><strong>Límite:</strong> 30 requests/minuto (suficiente para tu caso)</li>
          <li><strong>Velocidad:</strong> ⚡⚡⚡⚡⚡ Ultra rápida</li>
          <li><strong>Costo:</strong> $0 (100% gratis)</li>
          <li><strong>Modelos:</strong> 6 opciones disponibles</li>
          <li><strong>Consejo:</strong> Si un modelo falla, intenta otro</li>
        </ul>
      </div>

      {/* Debug Info */}
      <div style={{
        marginTop: '20px',
        padding: '12px',
        background: '#f5f5f5',
        borderRadius: '4px',
        fontSize: '11px',
        color: '#999',
        fontFamily: 'monospace',
        border: '1px solid #ddd'
      }}>
        <p style={{ margin: '0 0 8px' }}>🔧 Debug:</p>
        <p style={{ margin: '0' }}>API Key cargada: {process.env.REACT_APP_GROQ_API_KEY ? '✅ Sí' : '❌ No'}</p>
        <p style={{ margin: '4px 0' }}>Endpoint: https://api.groq.com/openai/v1/chat/completions</p>
        <p style={{ margin: '4px 0' }}>Abre la consola (F12) para ver detalles</p>
      </div>
    </div>
  );
};

export default TestGroq;
