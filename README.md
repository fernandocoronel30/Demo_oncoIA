# OncoGuía Digital — Backend con IA real (OncoIA)

Este proyecto conecta el chat **OncoIA** a la API real de Claude (Anthropic),
en lugar de las respuestas fijas de la versión de demostración.

## Estructura

```
oncoguia-ia/
├── server.js              # Backend Express: sirve el frontend y expone /api/chat
├── package.json
├── .env.example            # Plantilla de variables de entorno (copiar a .env)
├── .gitignore
├── knowledge/
│   └── biblioteca.json     # Contenido validado que OncoIA usa como contexto (RAG simple)
└── public/
    └── index.html          # El frontend completo (landing + chat conectado al backend)
```

## 1. Requisitos

- Node.js 18 o superior (trae `fetch` incluido, no necesitas instalar nada extra para llamar a la API).
- Una API key de Anthropic. Se obtiene en [console.anthropic.com](https://console.anthropic.com).

## 2. Instalación

```bash
cd oncoguia-ia
npm install
```

## 3. Configurar la API key

```bash
cp .env.example .env
```

Abre `.env` y coloca tu clave real:

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-sonnet-4-6
PORT=3000
```

**Importante:** el archivo `.env` nunca debe subirse a un repositorio (ya está excluido en `.gitignore`). Revisa en `docs.claude.com` el nombre exacto del modelo vigente antes de desplegar a producción, ya que estos identificadores cambian con el tiempo.

## 4. Ejecutar

```bash
npm start
```

Verás en la consola:

```
✅ OncoGuía Digital corriendo en http://localhost:3000
```

Abre `http://localhost:3000` en Chrome (ya no abras `index.html` directamente con doble clic — ahora el sitio necesita que el servidor esté corriendo para que el chat funcione).

## 5. Cómo funciona el chat ahora

1. El usuario escribe en el chat → el frontend llama a `POST /api/chat`.
2. El backend revisa si el mensaje sugiere una urgencia médica (sangrado, pensamientos de daño propio, etc.) y, si es así, responde de inmediato remitiendo a atención médica real, **sin llamar al modelo**.
3. Si no es una urgencia, el backend busca en `knowledge/biblioteca.json` contenido relacionado con la pregunta (por palabras clave) y se lo pasa a Claude como contexto validado, junto con instrucciones estrictas de no diagnosticar ni inventar información.
4. Claude responde y el backend regresa esa respuesta al frontend, que la muestra en la burbuja de chat tal como antes.

## 6. Ampliar la base de conocimiento

Para agregar más temas, simplemente edita `knowledge/biblioteca.json` y agrega un nuevo objeto:

```json
{
  "id": "efectos_secundarios",
  "tema": "Efectos secundarios comunes",
  "palabras_clave": ["efectos secundarios", "nauseas", "cansancio"],
  "contenido": "Texto validado por el equipo médico sobre este tema..."
}
```

No necesitas tocar el código del servidor: la búsqueda de contexto es automática.

## 7. Antes de mostrarlo a hospitales o inversionistas

- Pide a tu equipo médico (Dra./Dr. validadores) que revise el `SYSTEM_PROMPT` en `server.js` y el contenido de `biblioteca.json`.
- Considera agregar un límite de mensajes por usuario/IP para controlar costos de API.
- Si vas a manejar datos reales de pacientes (no solo preguntas educativas generales), revisa el cumplimiento de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) antes de operar con información real.

## 8. Desplegar en internet (para que otros lo prueben sin tu computadora encendida)

Opciones sencillas para un MVP:

- **Render** o **Railway**: conectas tu repositorio de GitHub, configuras `ANTHROPIC_API_KEY` como variable de entorno en su panel, y listo.
- Ambos detectan automáticamente `npm start` gracias al `package.json` incluido.

No subas nunca tu `.env` real al repositorio; usa el panel de variables de entorno del servicio que elijas.
