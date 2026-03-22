const express = require('express');
const axios = require('axios');
const ical = require('ical');
const cors = require('cors');

const app = express();
app.use(cors()); // Importante: tu panel podrá consultar este proxy

// Configuración de las 3 cabañas
const cabins = {
  'cabin1': 'https://www.airbnb.com/calendar/ical/1337276103911358917.ics?t=dae43f43820441b886a5167ef71c8533&locale=es-419',
  'cabin2': 'https://www.airbnb.com/calendar/ical/1110346888721141996.ics?t=a51528fdc71c427ba5a3ca4b75c368a1&locale=es-419',
  'cabin3': 'https://www.airbnb.com/calendar/ical/1230287544066345753.ics?t=57d2ae8677694038b86ca635030c6020&locale=es-419'
};

// Endpoint que tu panel consultará
app.get('/api/calendar/:cabinId', async (req, res) => {
  const cabinId = req.params.cabinId;
  const icalUrl = cabins[cabinId];
  
  if (!icalUrl) {
    return res.status(404).json({ error: 'Cabaña no encontrada' });
  }

  try {
    // Fetch del archivo .ics
    const response = await axios.get(icalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CasaVerdeCanas/1.0)'
      },
      timeout: 10000
    });

    // Parsear el contenido iCal a objeto JSON
    const parsed = ical.parseICS(response.data);
    
    // Filtrar solo eventos de ocupación/bloqueo
    const events = [];
    for (let key in parsed) {
      const event = parsed[key];
      if (event.type === 'VEVENT') {
        events.push({
          start: event.start,
          end: event.end,
          summary: event.summary,  // "Reserved" o "blocked"
          status: event.status
        });
      }
    }

    res.json({
      cabinId: cabinId,
      lastUpdate: new Date().toISOString(),
      events: events
    });

  } catch (error) {
    console.error(`Error fetching calendar for ${cabinId}:`, error.message);
    res.status(500).json({ 
      error: 'No se pudo obtener el calendario',
      details: error.message 
    });
  }
});

app.listen(3000, () => {
  console.log('Proxy iCal corriendo en http://localhost:3000');
});