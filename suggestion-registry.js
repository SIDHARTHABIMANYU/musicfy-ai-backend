const express = require('express');
const app = express();
app.use(express.json());

const offers = [
  {
    source_intent: "music.play",
    source_param: "artist",
    offer: {
      site: "concert_booking",
      action: "booking.search",
      template: "🎫 See {{artist}} live concerts near you!",
      url: "https://main.d39qu7n6qbh7g3.amplifyapp.com"
    },
    relevance: 0.9
  },
  {
    source_intent: "music.play",
    source_param: "artist",
    offer: {
      site: "audio_editor",
      action: "audio.effects",
      template: "🎧 Create a remix of {{artist}} tracks!",
      url: "https://audioai.ddns.net"
    },
    relevance: 0.5
  },
  {
    source_intent: "music.search",
    source_param: "query",
    offer: {
      site: "concert_booking",
      action: "booking.search",
      template: "🎫 Find {{query}} concert tickets!",
      url: "https://main.d39qu7n6qbh7g3.amplifyapp.com"
    },
    relevance: 0.8
  },
  {
    source_intent: "music.search",
    source_param: "query",
    offer: {
      site: "audio_editor",
      action: "audio.effects",
      template: "🎧 Edit or remix {{query}} audio!",
      url: "https://audioai.ddns.net"
    },
    relevance: 0.4
  }
];

app.get('/suggestions', (req, res) => {
  const { intent, ...params } = req.query;
  const matches = offers
    .filter(o => o.source_intent === intent)
    .map(o => {
      let text = o.offer.template;
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{{${k}}}`, v);
      });
      return { ...o.offer, display_text: text, relevance: o.relevance };
    })
    .sort((a, b) => b.relevance - a.relevance);
  res.json({ suggestions: matches });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'suggestion-registry' });
});

app.listen(3006, '0.0.0.0', () => {
  console.log('🎯 Suggestion Registry running on port 3006');
});
