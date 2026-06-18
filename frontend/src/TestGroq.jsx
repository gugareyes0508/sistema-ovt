import React, { useState } from 'react';

const TestGroq = () => {
  const [respuesta, setRespuesta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [modeloUsado, setModeloUsado] = useState('');

  // Lista de modelos a probar en orden de preferencia
  const modelosAProbar = [
    'llama-3.2-90b-vision-preview',
    'llama-3.2-11b-vision-preview',
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma-2-9b-it',
    'mixtral-8x7b-32768'
  ];

  const llamarGroqConModelos = async () => {
    setCargando(true);
    setError('');
    setRespuesta('');
    setModeloUsado('');

    let ultimoError = '';

    // Intenta cada modelo hasta que uno funcione
    for (let modelo of modelosAProbar) {
      try {
        console.log(`📡 Intentando con modelo: ${modelo}`);

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

        console.log(`Status ${modelo}:`, response.status);

        if (response.ok) {
          const data = await response.json();
          const textoRespuesta = data.choices[0].message.content;
          
          setRespuesta(textoRespuesta);
          setModeloUsado(modelo);
          console.log(`✅ Éxito con modelo: ${modelo}`);
          setCargando(false);
          return; // Éxito, salir
        } else {
          const errorData = await response.json();
          ultimoError = errorData.error?.message || response.statusText;
          console.warn(`❌ ${modelo} falló: ${ultimoError}`);
          // Continuar con el siguiente modelo
        }
      } catch (err) {
        console.warn(`❌ Error con ${modelo}:`, err.message);
        ultimoError = err.message;
        // Continuar con el siguiente modelo
      }
    }

    // Si llegamos aquí, ningún modelo funcionó
    setError(`Ningún modelo disponible funcionó. Último error: ${ultimoError}\n\nModelos probados: ${modelosAProbar.join(', ')}`);
    setCargando(false);
  };

  return (
    <div style={{ padding: '30px', maxWidth: '700px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ margin: '0 0 10px', color: '#333', fontSize: '24px' }}>🧪 Test GROQ API</h2>
        <p style={{ margin: '0', color: '#999', fontSize: '13px' }}>Auto-detección de modelo disponible</p>
      </div>

      {/* Info */}
      <div style={{
        padding: '15px',
        background: '#e3f2fd',
        borderRadius: '6px',
        border: '1px solid #90caf9',
        fontSize: '12px',
        color: '#1565c0',
        lineHeight: '1.6',
        marginBottom: '20px'
      }}>
        <p style={{ margin: '0 0 10px', fontWeight: 'bold' }}>⚙️ Cómo funciona:</p>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>Click en el botón y probará 6 modelos automáticamente</li>
          <li>Si uno falla, intenta el siguiente</li>
          <li>Muestra cuál modelo funcionó ✅</li>
          <li>Totalmente automático, sin selecciones manuales</li>
        </ul>
      </div>

      {/* Botón Principal */}
      <button 
        onClick={llamarGroqConModelos}
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
          <>⏳ Probando modelos...</>
        ) : (
          <>🚀 Llamar a GROQ (Auto-detección)</>
        )}
      </button>

      {/* Modelo Usado */}
      {modeloUsado && (
        <div style={{
          padding: '12px',
          background: '#e8f5e9',
          borderRadius: '6px',
          border: '1px solid #4caf50',
          marginBottom: '15px',
          fontSize: '12px',
          color: '#2e7d32',
          fontWeight: 'bold'
        }}>
          ✅ Modelo activo: <span style={{ fontFamily: 'monospace' }}>{modeloUsado}</span>
        </div>
      )}

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
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace'
        }}>
          <p style={{ margin: '0 0 8px', fontWeight: 'bold' }}>❌ Error</p>
          {error}
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
            ✅ Respuesta de GROQ:
          </p>
          <div style={{
            padding: '12px',
            background: 'white',
            borderRadius: '4px',
            fontSize: '13px',
            lineHeight: '1.6',
            color: '#333',
            border: '1px solid #c8e6c9'
          }}>
            {respuesta}
          </div>
        </div>
      )}

      {/* Modelos a Probar */}
      <div style={{
        padding: '15px',
        background: '#f5f5f5',
        borderRadius: '6px',
        border: '1px solid #ddd',
        fontSize: '12px',
        color: '#666'
      }}>
        <p style={{ margin: '0 0 10px', fontWeight: 'bold' }}>📋 Modelos que serán probados:</p>
        <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.8' }}>
          {modelosAProbar.map((m, i) => (
            <div key={m} style={{ padding: '4px 0', color: '#999' }}>
              {i + 1}. {m}
            </div>
          ))}
        </div>
      </div>

      {/* Debug Info */}
      <div style={{
        marginTop: '20px',
        padding: '12px',
        background: '#f9f9f9',
        borderRadius: '4px',
        fontSize: '11px',
        color: '#999',
        fontFamily: 'monospace',
        border: '1px solid #ddd'
      }}>
        <p style={{ margin: '0 0 8px' }}>🔧 Debug:</p>
        <p style={{ margin: '0' }}>API Key cargada: {process.env.REACT_APP_GROQ_API_KEY ? '✅ Sí' : '❌ No'}</p>
        <p style={{ margin: '4px 0' }}>Abre consola (F12) para ver cuál modelo está siendo probado</p>
      </div>
    </div>
  );
};

export default TestGroq;
