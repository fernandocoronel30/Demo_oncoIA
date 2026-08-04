/* ============================================================
   OncoGuía Digital — Backend de OncoIA
   Conecta el chat del frontend con la API de Claude (Anthropic)
   de forma segura: la API key nunca se expone al navegador.
   ============================================================ */

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;
// Verifica el nombre exacto del modelo vigente en docs.claude.com antes de desplegar a producción.
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';

if (!API_KEY) {
  console.warn('⚠️ OPENAI_API_KEY no está configurada.');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // sirve index.html

/* ---------- 1. BASE DE CONOCIMIENTO (RAG simple por palabras clave) ---------- */
// En un MVP no necesitamos una base vectorial: basta con buscar coincidencias
// de palabras clave en la pregunta del usuario y pasar esos textos como
// contexto al modelo, para que responda basado en contenido validado y no
// "invente" información médica.
let knowledgeBase = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, 'knowledge', 'biblioteca.json'), 'utf8');
  knowledgeBase = JSON.parse(raw);
} catch (err) {
  console.error('No se pudo cargar la biblioteca de conocimiento:', err.message);
}

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita acentos
}

// Busca en la biblioteca los artículos relevantes a la pregunta del usuario
function recuperarContexto(mensajeUsuario) {
  const texto = normalizar(mensajeUsuario);
  const coincidencias = knowledgeBase.filter((articulo) =>
    articulo.palabras_clave.some((kw) => texto.includes(normalizar(kw)))
  );
  if (coincidencias.length === 0) return null;
  return coincidencias
    .map((a) => `Tema: ${a.tema}\nContenido validado: ${a.contenido}`)
    .join('\n\n');
}

/* ---------- 2. FILTRO DE SEGURIDAD PARA URGENCIAS ---------- */
// Si el mensaje sugiere una urgencia médica o riesgo, respondemos de inmediato
// sin pasar por el modelo, remitiendo a atención médica real.
const PALABRAS_URGENCIA = [
  'sangrado abundante', 'sangro mucho', 'no puedo respirar', 'dolor insoportable',
  'quiero morir', 'suicid', 'fiebre muy alta', 'desmay', 'convulsion', 'emergencia'
];

function esUrgencia(mensaje) {
  const texto = normalizar(mensaje);
  return PALABRAS_URGENCIA.some((p) => texto.includes(normalizar(p)));
}

const RESPUESTA_URGENCIA =
  'Lo que describes suena a algo que requiere atención médica inmediata. ' +
  'Por favor comunícate ahora mismo a los servicios de emergencia de tu localidad o acude al servicio de urgencias más cercano. ' +
  'No puedo evaluar síntomas en tiempo real, y tu seguridad es lo más importante.';

/* ---------- 3. INSTRUCCIONES DEL SISTEMA PARA ONCOIA ---------- */
const SYSTEM_PROMPT = `Eres OncoIA, el asistente educativo de OncoGuía Digital, una plataforma que orienta a pacientes oncológicos y sus familias en México.

Reglas estrictas que debes seguir siempre:
1. Ofreces únicamente información educativa general sobre procesos oncológicos (qué es un tratamiento, cómo prepararse, qué esperar). NUNCA das diagnósticos, dosis, pronósticos ni recomendaciones de tratamiento personalizadas.
2. Si el contexto validado (proporcionado abajo) contiene información relevante a la pregunta, básate en él y no te apartes de esos hechos.
3. Si no tienes contexto validado sobre el tema, dilo con honestidad y sugiere que la persona lo consulte con su equipo médico, en vez de inventar información.
4. Ante cualquier duda sobre síntomas personales, urgencias, o decisiones de tratamiento específicas, remite siempre a consultar con un médico real.
5. Tono: cálido, claro, breve (máximo 5-6 líneas), en español, sin tecnicismos innecesarios.
6. Recuerda con naturalidad, cuando sea pertinente, que esta información es educativa y no sustituye la consulta médica.`;

/* ---------- 4. ENDPOINT PRINCIPAL DEL CHAT ---------- */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'Falta el mensaje del usuario.' });
    }

    // 4.1 Filtro de urgencias: se responde sin llamar al modelo
    if (esUrgencia(message)) {
      return res.json({ reply: RESPUESTA_URGENCIA });
    }

    if (!API_KEY) {
      return res.status(500).json({
        reply: 'El asistente OncoIA aún no está conectado a la IA (falta configurar OPENAI_API_KEY en el servidor).'
      });
    }

    // 4.2 Recuperar contexto validado relacionado con la pregunta
    const contexto = recuperarContexto(message);
    const userContent = contexto
      ? `Contexto validado disponible:\n${contexto}\n\nPregunta del paciente: ${message}`
      : `No se encontró contexto validado específico para esta pregunta.\n\nPregunta del paciente: ${message}`;

    // 4.3 Armar historial de conversación (limitado a los últimos turnos para no crecer indefinidamente)
    const historialPrevio = Array.isArray(history) ? history.slice(-8) : [];

    const response = await fetch(
  "https://api.openai.com/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        ...historialPrevio,
        {
          role: "user",
          content: userContent
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    })
  }
);


    const data = await response.json();
     if (!response.ok) {
  const errorBody = await response.text();
  console.error(errorBody);
}
     console.log("========== OPENAI ==========");
console.log(JSON.stringify(data, null, 2));
console.log("============================");
    const reply =
  data.choices?.[0]?.message?.content ??
  "No obtuve una respuesta clara. ¿Puedes reformular tu pregunta?";
     console.log("Respuesta completa de OpenAI:");
console.log(JSON.stringify(data, null, 2));

    res.json({ reply });
  } catch (err) {
    console.error('Error inesperado en /api/chat:', err);
    res.status(500).json({ reply: 'Ocurrió un error inesperado. Intenta de nuevo en unos momentos.' });
  }
});

/* ---------- 5. INICIO DEL SERVIDOR ---------- */
app.listen(PORT, () => {
  console.log(`✅ OncoGuía Digital corriendo en http://localhost:${PORT}`);
});
