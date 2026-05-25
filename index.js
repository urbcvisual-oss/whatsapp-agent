const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const EVOLUTION_URL  = process.env.EVOLUTION_URL;
const EVOLUTION_KEY  = process.env.EVOLUTION_API_KEY;
const INSTANCE       = process.env.EVOLUTION_INSTANCE;

const SYSTEM_PROMPT = `
Você é a Lia, assistente virtual da empresa de gráfica e comunicação visual localizada em São Luís de Montes Belos - GO.
Telefone: (64) 9 9259-6594 | Endereço: Rua Bom Jardim, 1410, Centro.

Seu papel é atender clientes pelo WhatsApp de forma simpática, rápida e profissional.

SERVIÇOS QUE A EMPRESA OFERECE:
- Banners e faixas (lona, vinil)
- Adesivos (em vinil, janela, parede)
- Placas (ACM, PVC, PS, metal)
- Cartões de visita
- Panfletos e folders
- Camisetas e uniformes personalizados
- Lonas para caminhão e carretas
- Letras caixa e letreiros
- Envelopamento de veículos
- Brindes personalizados

PARA PASSAR ORÇAMENTOS, pergunte ao cliente:
1. Qual produto deseja?
2. Qual tamanho ou quantidade?
3. Tem arte pronta ou precisa criar?
4. Qual a data que precisa?

Com essas informações, diga que vai calcular e retornar em breve (pois depende de materiais e arte).
Se o cliente insistir em valores, dê uma faixa de preço aproximada e deixe claro que é uma estimativa.

REGRAS:
- Responda sempre em português, de forma objetiva e amigável.
- Nunca invente preços exatos — diga que vai verificar e confirmar.
- Se a dúvida for muito técnica, peça para falar com um atendente humano.
- Mantenha as respostas curtas (máximo 4 linhas por mensagem).
- Use emojis com moderação para deixar a conversa mais leve.
`;

// Histórico de conversa por número de telefone (em memória)
const historico = new Map();

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const body = req.body;

  // Ignora mensagens enviadas pela própria empresa ou sem texto
  if (!body?.data?.message) return;
  if (body.data.key?.fromMe) return;

  const texto = body.data.message.conversation || body.data.message.extendedTextMessage?.text;
  if (!texto) return;

  const telefone = body.data.key.remoteJid;

  if (!historico.has(telefone)) {
    historico.set(telefone, []);
  }
  const hist = historico.get(telefone);

  try {
    const chat = model.startChat({
      history: hist,
      systemInstruction: SYSTEM_PROMPT,
    });

    const resultado = await chat.sendMessage(texto);
    const resposta  = resultado.response.text();

    // Atualiza histórico
    hist.push({ role: 'user',  parts: [{ text: texto }] });
    hist.push({ role: 'model', parts: [{ text: resposta }] });

    // Mantém no máximo as últimas 30 mensagens
    if (hist.length > 30) hist.splice(0, 2);

    // Envia resposta via Evolution API
    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${INSTANCE}`,
      { number: telefone, text: resposta },
      { headers: { apikey: EVOLUTION_KEY } }
    );
  } catch (err) {
    console.error('Erro ao processar mensagem:', err.message);
  }
});

app.get('/', (req, res) => res.send('Agente WhatsApp ativo ✓'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
