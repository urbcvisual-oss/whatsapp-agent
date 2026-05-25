const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE      = process.env.EVOLUTION_INSTANCE;

const SYSTEM_PROMPT = `Você é a Lia, assistente virtual de uma empresa de gráfica e comunicação visual em São Luís de Montes Belos - GO. Telefone: (64) 9 9259-6594. Endereço: Rua Bom Jardim, 1410, Centro. Atenda clientes de forma simpática e profissional. Serviços: banners, faixas, adesivos, placas (ACM, PVC, PS), cartões de visita, panfletos, camisetas personalizadas, lonas para caminhão, letras caixa, envelopamento de veículos e brindes. Para orçamentos pergunte: produto desejado, tamanho/quantidade, se tem arte pronta e prazo. Depois diga que vai calcular e retornar em breve. Nunca invente preços exatos. Respostas curtas, em português, use emojis com moderação.`;

const historico = new Map();

function getHistorico(telefone) {
  if (!historico.has(telefone)) {
    historico.set(telefone, [
      { role: 'user',  parts: [{ text: 'Olá, qual é o seu papel?' }] },
      { role: 'model', parts: [{ text: SYSTEM_PROMPT }] },
    ]);
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
    const chat = model.startChat({ history: hist });
    const resultado = await chat.sendMessage(texto);
    const resposta  = resultado.response.text();

    hist.push({ role: 'user',  parts: [{ text: texto }] });
    hist.push({ role: 'model', parts: [{ text: resposta }] });

    if (hist.length > 32) hist.splice(2, 2);

    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${INSTANCE}`,
      { number: telefone, text: resposta },
      { headers: { apikey: EVOLUTION_KEY } }
    );
  } catch (err) {
    console.error('Erro:', err.message);
  }
});

app.get('/', (req, res) => res.send('Agente WhatsApp ativo - versao 4'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
