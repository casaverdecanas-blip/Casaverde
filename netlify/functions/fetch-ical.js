// netlify/functions/fetch-ical.js
exports.handler = async (event) => {
  // Obtener la URL del iCal desde el parámetro de consulta
  const { url } = event.queryStringParameters;
  if (!url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing "url" parameter' })
    };
  }

  try {
    // Realizar la petición al servidor de Airbnb
    const response = await fetch(url);
    const text = await response.text();

    // Verificar que el contenido sea un iCal válido
    if (!text.includes('BEGIN:VCALENDAR')) {
      throw new Error('Invalid iCal content (no BEGIN:VCALENDAR)');
    }

    // Devolver el contenido con el tipo MIME correcto
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar',
        'Access-Control-Allow-Origin': '*'
      },
      body: text
    };
  } catch (error) {
    console.error('Error fetching iCal:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};