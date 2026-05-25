const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE      = process.env.EVOLUTION_INSTANCE;

const SYSTEM_PROMPT = `Você é a Lia, assistente virtual de uma empresa de gráfica e comunicação visual em São Luís de Montes Belos - GO. Telefone: (64) 9 9259-6594. Endereço: Rua Bom Jardim, 1410, Centro. Atenda clientes de forma simpática e profissional. Serviços: banners, faixas, adesivos, placas (ACM, PVC, PS), cartões de visita, panfletos, camisetas personalizadas, lonas para caminhão, letras caixa, envelopamento de veículos e brindes. Para orçamentos pergunte: produto desejado, tamanho/quantidade, se tem arte pronta e prazo. Depois diga que vai calcular e retornar em breve. Nunca invente preços exatos. Respostas curtas, em português, use emojis com moderação.`;

const historico = new Map();

function getHistorico(telefone) {
  if (!historico.has(telefone)) {
    historico.set(telefone, []);
  }
  return historico.get(telefone);
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (!body?.data?.message) return;
  if (body.data.key?.fromMe) return;

  const texto = body.data.message.conversation || body.data.message.extendedTextMessage?.text;
  if (!texto) return;

  const telefone = body.data.key.remoteJid;
  const hist = getHistorico(telefone);

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...hist,
      { role: 'user', content: texto },
    ];

    const resultado = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages,
    });

    const resposta = resultado.choices[0].message.content;

    hist.push({ role: 'user',      content: texto });
    hist.push({ role: 'assistant', content: resposta });

    if (hist.length > 30) hist.splice(0, 2);

    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${INSTANCE}`,
      { number: telefone, text: resposta },
      { headers: { apikey: EVOLUTION_KEY } }
    );
  } catch (err) {
    console.error('Erro:', err.message);
  }
});

app.get('/', (req, res) => res.send('Agente WhatsApp ativo - Groq'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
